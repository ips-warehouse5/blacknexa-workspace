/**
 * The deterministic PII scrub for report text — filing *and* edits.
 *
 * docs/INCIDENT_MODULE_PLAN.md D14 and §7.9. Filing used to send every report
 * body to an LLM through the Rork toolkit, synchronously and from Node, with a
 * 15-second timeout on the filing path: "AI only in Python" was broken, filing
 * waited on a third party, and an LLM asked to redact "names" strips exactly the
 * officers' names and badge numbers a civil-rights report exists to record. Edits
 * were not scrubbed at all.
 *
 * Revision 2 replaces it with this: a small, fixed set of regular expressions for
 * contact and account details that no incident account needs to publish —
 * email addresses, phone numbers, US social-security numbers and payment-card
 * numbers — applied to the title and the body on filing and on every edit.
 * Anything subtler (a named private individual, a home street, a child's school)
 * is not guessed at here: the AI flags `private_info` and a moderator decides
 * (§6.3), which is a human judgement rather than a silent rewrite.
 *
 * ── What is deliberately *not* redacted ────────────────────────────────────
 * Reference numbers. A digit run that follows `case`, `complaint`, `report`,
 * `incident`, `badge`, `ref` or `#` is a complaint number, a badge number or a
 * case reference — the very details that make a report actionable — so the phone
 * pattern skips it (the same rule the comment detectors use, §4.5). Phone numbers
 * need at least nine digits, so dates, times, years and short local references
 * survive. Card numbers must pass the Luhn check, so an arbitrary long number is
 * not mistaken for one.
 *
 * Pure and dependency-free, so the unit tests exercise it without a `.env`.
 */

export interface ScrubResult {
  text: string;
  redactedCount: number;
  /** One entry per redaction, e.g. `["EMAIL", "PHONE"]`. Never the value itself. */
  redactedItems: string[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** 13–19 digits, optionally grouped by single spaces or dashes. */
const CARD = /(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g;

const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

/**
 * A phone-shaped run: an optional `+country`, an optional `(area)`, then digit
 * groups separated by single spaces, dots or dashes. The digit count is checked
 * separately (9–15), which is simpler to read than encoding it in the pattern.
 */
const PHONE =
  /(?<![\w+])(?:\+\d{1,3}[ .-]?)?(?:\(\d{1,5}\)[ .-]?)?\d{1,5}(?:[ .-]?\d{1,5}){1,6}(?![\w])/g;

/** A reference-number context immediately before a digit run (§4.5). */
const REFERENCE_CONTEXT =
  /(?:\b(?:case|complaint|report|incident|badge|ref|reference)\b\.?\s*(?:no\.?|number|num\.?|id)?\s*[:#-]?\s*|#\s*)$/i;

const MIN_PHONE_DIGITS = 9;
const MAX_PHONE_DIGITS = 15;

/** The Luhn checksum — true for a plausible payment-card number. */
export function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (value < 0 || value > 9) return false;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

/**
 * Scrub one piece of report text. Order matters: emails first (they can contain
 * digits), then cards and SSNs (both would otherwise look like phone numbers),
 * then phones.
 */
export function scrubReportText(input: string): ScrubResult {
  const items: string[] = [];
  let text = input;

  text = text.replace(EMAIL, () => {
    items.push("EMAIL");
    return "[EMAIL]";
  });

  text = text.replace(CARD, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits)) return match;
    items.push("CARD");
    return "[CARD]";
  });

  text = text.replace(SSN, () => {
    items.push("SSN");
    return "[ID_NUMBER]";
  });

  text = text.replace(PHONE, (match: string, offset: number, whole: string) => {
    const digits = match.replace(/\D/g, "").length;
    if (digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) return match;
    // A complaint, badge or case number — keep it. Look back a short window only,
    // so a "case" three sentences earlier does not shield a real phone number.
    const before = whole.slice(Math.max(0, offset - 32), offset);
    if (REFERENCE_CONTEXT.test(before)) return match;
    items.push("PHONE");
    return "[PHONE]";
  });

  return { text, redactedCount: items.length, redactedItems: items };
}
