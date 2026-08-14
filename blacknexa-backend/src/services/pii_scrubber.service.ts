/**
 * PII and metadata scrubber.
 *
 * Before an evidence package is stored, this service:
 *   1. Strips EXIF/GPS markers from uploaded JPEG media at the byte level —
 *      a photo of an incident should not silently disclose where the reporter
 *      lives.
 *   2. Asks the model to redact PII in the report text according to the reader's
 *      local privacy regime (GDPR redacts indirect identifiers too, CCPA keeps
 *      category-level information), falling back to a regex pass if the gateway
 *      is unavailable.
 *
 * Ported from `geo-legal/pii-scrubber.ts`; `atob`/`btoa` replaced with `Buffer`.
 */

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import { fetchWithTimeout, extractJsonObject } from "@/utils/http.util";
import { base64ToBytes, bytesToBase64 } from "@/utils/binary.util";
import type { PrivacyRegime } from "@/types/geo_legal.interface";

const SCRUB_TIMEOUT_MS = 15_000;

const SCRUBBER_SYSTEM = `You are the BlackNexa PII Scrubber. Given a text field and a privacy regime, identify and redact all personally identifiable information (PII) that should be minimized under that regime.

RULES:
1. Detect: full names, phone numbers, email addresses, physical addresses, ID/passport/driver's license numbers, bank account numbers, national insurance/social security numbers, dates of birth.
2. Replace each detected PII element with a placeholder in square brackets, e.g. [NAME], [PHONE], [EMAIL], [ADDRESS], [ID_NUMBER], [DOB].
3. Under GDPR/UK_DPA: also redact any data that could identify a natural person indirectly (e.g. workplace + job title combo that uniquely identifies someone).
4. Under CCPA: redact direct identifiers but keep category-level information.
5. Under LGPD/POPIA: same as GDPR — redact direct and indirect identifiers.
6. Do NOT redact: the reporter's own name if they chose to include it, public agency names, public official names acting in official capacity, dates of the incident, locations of the incident.
7. Preserve the meaning and structure of the text. Only replace PII — do not rewrite or summarize.

Output STRICTLY this JSON shape and nothing else:
{"scrubbedText":"...","redactedCount":3,"redactedItems":["NAME","PHONE","EMAIL"]}`;

interface ScrubbedText {
  scrubbedText: string;
  redactedCount: number;
  redactedItems: string[];
}

/** Result of a full evidence scrub. */
export interface ScrubResult extends ScrubbedText {
  metadataStripped: boolean;
  cleanedMediaBase64?: string;
}

class PiiScrubberService {
  /** Scrub PII from text, falling back to regex when the gateway is unavailable. */
  async scrubPiiFromText(text: string, regime: PrivacyRegime): Promise<ScrubbedText> {
    const aiResult = await this.scrubViaAi(text, regime);
    return aiResult ?? this.regexScrub(text);
  }

  private async scrubViaAi(
    text: string,
    regime: PrivacyRegime,
  ): Promise<ScrubbedText | null> {
    if (!env.ai.enabled) return null;

    const userPrompt = `PRIVACY REGIME: ${regime}

TEXT TO SCRUB:
${text}

Redact all PII according to ${regime} requirements. Preserve the reporter's own self-identification, public agency names, and incident details.`;

    const res = await fetchWithTimeout(
      `${env.ai.toolkitUrl}/v2/vercel/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.ai.secretKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [
            { role: "system", content: SCRUBBER_SYSTEM },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.1,
          max_tokens: 1500,
        }),
      },
      SCRUB_TIMEOUT_MS,
    );
    if (!res) return null;
    if (!res.ok) {
      logger.warn("[pii-scrubber] gateway non-ok", { status: res.status });
      return null;
    }

    const data = (await res.json().catch(() => null)) as
      | { choices?: { message?: { content?: string } }[] }
      | null;
    const content = data?.choices?.[0]?.message?.content ?? "";
    return extractJsonObject<ScrubbedText>(
      content,
      (p) => typeof p.scrubbedText === "string",
    );
  }

  /** Regex fallback: email, phone, and SSN-shaped patterns. */
  private regexScrub(text: string): ScrubbedText {
    let scrubbed = text;
    let count = 0;
    const items: string[] = [];

    scrubbed = scrubbed.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, () => {
      count++;
      items.push("EMAIL");
      return "[EMAIL]";
    });

    scrubbed = scrubbed.replace(
      /(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g,
      (match) => {
        // Skip short digit runs that are more likely dates or case numbers.
        if (match.replace(/\D/g, "").length < 7) return match;
        count++;
        items.push("PHONE");
        return "[PHONE]";
      },
    );

    scrubbed = scrubbed.replace(/\b\d{3}-\d{2}-\d{4}\b/g, () => {
      count++;
      items.push("SSN");
      return "[ID_NUMBER]";
    });

    return { scrubbedText: scrubbed, redactedCount: count, redactedItems: items };
  }

  /**
   * Strip EXIF/GPS metadata from a JPEG by walking its markers.
   *
   * Byte-level parsing keeps this dependency-free. Non-JPEG input is returned
   * untouched with `metadataStripped: false` — best effort, honestly reported.
   */
  stripImageMetadata(base64Image: string): {
    cleanedBase64: string;
    metadataStripped: boolean;
  } {
    try {
      const bytes = base64ToBytes(base64Image);
      // JPEG starts with SOI 0xFFD8.
      if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        return { cleanedBase64: base64Image, metadataStripped: false };
      }
      const cleaned = this.stripJpegMetadata(bytes);
      return { cleanedBase64: bytesToBase64(cleaned), metadataStripped: true };
    } catch {
      return { cleanedBase64: base64Image, metadataStripped: false };
    }
  }

  /** Remove APP1 (EXIF/GPS), APP2–APP15, and COM segments from JPEG bytes. */
  private stripJpegMetadata(bytes: Buffer): Buffer {
    const markers: Array<{ start: number; length: number }> = [];
    let i = 2; // skip SOI

    while (i < bytes.length - 1) {
      if (bytes[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = bytes[i + 1];

      // APP0 (JFIF) is structural — keep it.
      if (marker === 0xe0) {
        i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
        continue;
      }
      // APP1 (EXIF/GPS), APP2–APP15, and COM all carry metadata — strip.
      if (marker === 0xe1 || (marker >= 0xe2 && marker <= 0xef) || marker === 0xfe) {
        const len = (bytes[i + 2] << 8) | bytes[i + 3];
        markers.push({ start: i, length: 2 + len });
        i += 2 + len;
        continue;
      }
      // SOS — image data follows, stop scanning.
      if (marker === 0xda) break;
      // Any other length-prefixed marker.
      if (marker >= 0xc0 && marker <= 0xfe) {
        i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
        continue;
      }
      i++;
    }

    if (markers.length === 0) return bytes;

    // Concatenate the surviving segments.
    const parts: Buffer[] = [];
    let pos = 0;
    for (const m of markers) {
      parts.push(bytes.subarray(pos, m.start));
      pos = m.start + m.length;
    }
    parts.push(bytes.subarray(pos));
    return Buffer.concat(parts);
  }

  /** Full evidence scrub: text PII redaction plus media metadata stripping. */
  async scrubEvidence(input: {
    text: string;
    mediaBase64?: string;
    privacyRegime: PrivacyRegime;
  }): Promise<ScrubResult> {
    const textResult = await this.scrubPiiFromText(input.text, input.privacyRegime);

    let metadataStripped = false;
    let cleanedMediaBase64: string | undefined;
    if (input.mediaBase64) {
      const mediaResult = this.stripImageMetadata(input.mediaBase64);
      metadataStripped = mediaResult.metadataStripped;
      cleanedMediaBase64 = mediaResult.cleanedBase64;
    }

    return { ...textResult, metadataStripped, cleanedMediaBase64 };
  }
}

export const piiScrubberService = new PiiScrubberService();
export default piiScrubberService;
