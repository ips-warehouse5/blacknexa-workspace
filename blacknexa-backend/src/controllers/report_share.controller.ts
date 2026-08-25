/**
 * The public page behind a shared link — `GET /r/:caseRef`. `DERIVED` from D10.
 *
 * D10 hands the owner a `blacknexa.org/r/BNX-4471` URL and a card listing exactly
 * what a recipient sees. Without a page at the other end, that link is a 404 and
 * the whole screen is a promise the product does not keep.
 *
 * ── What the page must not do ──────────────────────────────────────────────
 * D10's card is a contract, not a description, so each line is enforced here rather
 * than trusted to the projection:
 *
 *   • **No author name.** Not even when the report was filed under a real one. A
 *     link travels through group chats and screenshots; the person who filed cannot
 *     take it back once it has, so the page never carries their name at all.
 *   • **No exact location.** The rounded label and nothing else — the same view the
 *     feed gets, never the sealed coordinates.
 *   • **No files.** Evidence is listed by kind and count, never linked. A presigned
 *     URL on a public page would be handed to every chat app, link scanner and
 *     preview crawler the link passes through, and those caches are not ours to
 *     empty.
 *   • **No `og:image`.** For the same reason: a preview image generated from
 *     evidence would put the photograph itself into every one of those caches. The
 *     preview is text, which is the one form of it we can honestly control.
 *   • **No trace back to the sharer.** Opening the link records nothing about who
 *     opened it and tells the author nothing — "that you shared it" is the third
 *     line of D10's card.
 *
 * ── Who can open it ───────────────────────────────────────────────────────
 * A public report needs no token: it is already in the community feed. Anything
 * narrower needs the `?t=` token the owner minted, and a revoked token is a 404 —
 * not a 403, which would confirm the report exists.
 */

import type { Request, Response } from "express";
import env from "@/config/env.config";
import { Report } from "@/models/report.model";
import reportService from "@/services/report.service";
import { CATEGORY_LABELS, type EvidenceKind, type ReportCategory } from "@/types/report.interface";

/** Escape everything interpolated into the page. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A day, not a time. The hour someone was somewhere is not for a public page. */
function shortDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  submitted: { label: "Filed — awaiting review", tone: "#7A8593" },
  under_review: { label: "Under review", tone: "#B26A00" },
  verified: { label: "Verified by a moderator", tone: "#1A8F4C" },
  dismissed: { label: "Reviewed — no action taken", tone: "#7A8593" },
  draft: { label: "Not filed", tone: "#7A8593" },
};

/**
 * "Two photos and a recording" from a list of kinds.
 *
 * `evidenceService.describe` describes one file including its size and duration,
 * which is more than this page should say — a 40-minute recording is itself a
 * detail about the incident. This counts kinds and stops there.
 */
function describeKinds(kinds: EvidenceKind[]): string {
  const labels: Record<EvidenceKind, [string, string]> = {
    photo: ["photo", "photos"],
    video: ["video", "videos"],
    audio: ["recording", "recordings"],
    document: ["document", "documents"],
  };
  const counts = new Map<EvidenceKind, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);

  const parts = [...counts.entries()].map(([kind, count]) => {
    const [one, many] = labels[kind];
    return `${count} ${count === 1 ? one : many}`;
  });

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const STRENGTH_COPY: Record<string, string> = {
  thin: "Limited supporting material",
  fair: "Some supporting material",
  strong: "Strong supporting material",
  very_strong: "Strong supporting material, independently corroborated",
};

class ReportShareController {
  /** `GET /r/:caseRef` — server-rendered, cacheable, no JavaScript. */
  async page(req: Request, res: Response): Promise<void> {
    const caseRef = String(req.params.caseRef ?? "").toUpperCase();
    const token = typeof req.query.t === "string" ? req.query.t : null;

    const report = await Report.findOne({ where: { case_ref: caseRef, deleted_at: null } });
    if (!report) {
      this.notFound(res);
      return;
    }

    /*
     * A public report is already readable by anyone. Anything narrower needs the
     * token, checked against a live row — so revoking a link in the app actually
     * closes the page rather than only hiding the button.
     */
    if (report.visibility !== "public") {
      if (!token) {
        this.notFound(res);
        return;
      }
      const valid = await reportService.resolveShareToken(token, report.id);
      if (!valid) {
        this.notFound(res);
        return;
      }
    }

    /*
     * One projection, built in the service, carrying only what D10 permits. The
     * controller never touches the report row for display, so it cannot reach past
     * the redactions by accident.
     */
    const view = await reportService.shareView(report);
    const status = STATUS_COPY[view.status] ?? STATUS_COPY.submitted;
    const category = CATEGORY_LABELS[view.category as ReportCategory] ?? view.category;

    /*
     * The preview text. Category, place and date — enough for a recipient to know
     * what they are being sent, and nothing a link preview should not carry.
     */
    const preview = [category, view.locationLabel || null, shortDate(view.occurredAt)]
      .filter(Boolean)
      .join(" · ");

    const canonical = `${env.publicSiteOrigin}/r/${esc(view.caseRef)}`;

    res
      .status(200)
      .type("html")
      // Cacheable, but never by a shared cache: a token-gated page must not end up
      // in a CDN edge that would then serve it without the token.
      .set("Cache-Control", "private, max-age=300")
      // Belt and braces on the no-image promise: nothing on this page should be
      // fetched cross-origin either.
      .set("Referrer-Policy", "no-referrer")
      .set("X-Robots-Tag", view.indexable ? "all" : "noindex, nofollow")
      .send(
        this.render({
          caseRef: view.caseRef,
          title: view.title,
          body: view.body,
          category,
          preview,
          canonical,
          locationLabel: view.locationLabel,
          precisionNote:
            view.locationPrecision === "hidden"
              ? "The person who filed this chose not to share a location."
              : view.locationPrecision === "approximate"
                ? "Rounded to the nearest 500 metres."
                : "Rounded to the nearest 100 metres.",
          occurred: shortDate(view.occurredAt),
          filed: shortDate(view.filedAt),
          statusLabel: status.label,
          statusTone: status.tone,
          strength: STRENGTH_COPY[view.evidenceStrength] ?? "",
          evidenceSummary: describeKinds(view.evidenceKinds),
          evidenceCount: view.evidenceKinds.length,
          supportCount: view.supportCount,
          corroborationCount: view.corroborationCount,
          indexable: view.indexable,
        }),
      );
  }

  /**
   * A 404 rather than a 403 for a report that exists but is not shareable to this
   * caller. A 403 confirms the case reference is real, which for a private report is
   * itself the disclosure.
   */
  private notFound(res: Response): void {
    res.status(404).type("html").set("X-Robots-Tag", "noindex, nofollow").send(shell({
      title: "This link is not available",
      indexable: false,
      canonical: null,
      description: null,
      main: `<div class="empty">
        <h1>This link is not available</h1>
        <p>It may have been withdrawn by the person who shared it, or the report may have been removed. Nothing else is known from this page.</p>
      </div>`,
    }));
  }

  private render(data: {
    caseRef: string;
    title: string;
    body: string;
    category: string;
    preview: string;
    canonical: string;
    locationLabel: string | null;
    precisionNote: string;
    occurred: string;
    filed: string;
    statusLabel: string;
    statusTone: string;
    strength: string;
    evidenceSummary: string;
    evidenceCount: number;
    supportCount: number;
    corroborationCount: number;
    indexable: boolean;
  }): string {
    const facts: [string, string][] = [
      ["Category", data.category],
      ["When", data.occurred],
      ["Where", data.locationLabel || "Not shared"],
      ["Filed", data.filed],
    ];

    return shell({
      title: `${data.title} — BlackNexa`,
      description: data.preview,
      canonical: data.canonical,
      indexable: data.indexable,
      main: `
  <article>
    <div class="eyebrow">
      <span class="ref">${esc(data.caseRef)}</span>
      <span class="status" style="color:${data.statusTone}">${esc(data.statusLabel)}</span>
    </div>

    <h1>${esc(data.title)}</h1>

    <!-- Never a name. See the file header. -->
    <p class="byline">Filed anonymously on BlackNexa</p>

    <div class="body">${esc(data.body)
      .split(/\n{2,}/)
      .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
      .join("")}</div>

    <dl class="facts">
      ${facts
        .map(
          ([key, value]) =>
            `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`,
        )
        .join("")}
    </dl>
    <p class="note">${esc(data.precisionNote)}</p>

    <section class="panel">
      <h2>Supporting material</h2>
      <p>${
        data.evidenceCount === 0
          ? "No files were attached."
          : `${esc(data.evidenceSummary)}. ${esc(data.strength)}.`
      }</p>
      <!-- Listed, never linked. -->
      <p class="note">Files are sealed and are not available from this page. They can be checked by a moderator against the record they were filed with.</p>
    </section>

    ${
      data.supportCount + data.corroborationCount > 0
        ? `<section class="panel">
             <h2>From the community</h2>
             <p>${data.supportCount} ${data.supportCount === 1 ? "person has" : "people have"} stood with this report${
               data.corroborationCount > 0
                 ? `, and ${data.corroborationCount} ${data.corroborationCount === 1 ? "says it happened" : "say it happened"} to them too`
                 : ""
             }.</p>
           </section>`
        : ""
    }

    <footer>
      <p><strong>This is an account filed by a member of the public.</strong> ${
        data.statusLabel === "Verified by a moderator"
          ? "A moderator has reviewed the filing and the material attached to it."
          : "It has not been verified, and nothing here is a finding of fact."
      }</p>
      <p class="note">Opening this link tells the person who filed the report nothing about you, and nothing about who shared it.</p>
    </footer>
  </article>`,
    });
  }
}

/**
 * The page shell.
 *
 * Deliberately one file with inline CSS and no script: this page is opened from
 * chat apps, in-app browsers and link scanners, and every external request it would
 * make is a request that leaks who is reading it.
 */
function shell(data: {
  title: string;
  description: string | null;
  canonical: string | null;
  indexable: boolean;
  main: string;
}): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(data.title)}</title>
${data.description ? `<meta name="description" content="${esc(data.description)}">` : ""}
${data.canonical ? `<link rel="canonical" href="${esc(data.canonical)}">` : ""}
${data.indexable ? "" : '<meta name="robots" content="noindex, nofollow">'}
<meta name="referrer" content="no-referrer">
<meta property="og:type" content="article">
<meta property="og:site_name" content="BlackNexa">
<meta property="og:title" content="${esc(data.title)}">
${data.description ? `<meta property="og:description" content="${esc(data.description)}">` : ""}
${data.canonical ? `<meta property="og:url" content="${esc(data.canonical)}">` : ""}
<!--
  No og:image on purpose. A preview drawn from the evidence would put the
  photograph into every chat app, scanner and CDN the link passes through, and
  those caches cannot be emptied afterwards. Text is the only preview we can keep
  the promise on.
-->
<meta name="twitter:card" content="summary">
<style>
:root{
  --bg:#FFFFFF;--s1:#F1F5FA;--s3:#F5F7FA;--line:#D5DCE4;
  --t0:#0E1116;--t2:#55606E;--t3:#7A8593;--acc:#0A7CFF;
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{
  margin:0;background:var(--bg);color:var(--t0);
  font:400 16px/1.65 "Work Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif;
  -webkit-font-smoothing:antialiased;
}
main{max-width:640px;margin:0 auto;padding:32px 20px 72px}
.eyebrow{display:flex;flex-wrap:wrap;gap:10px;align-items:center;
  font:500 11px/1 -apple-system,sans-serif;letter-spacing:.12em;text-transform:uppercase}
.ref{color:var(--t3);font-family:ui-monospace,Menlo,monospace;letter-spacing:.06em}
h1{margin:14px 0 0;font:600 27px/1.25 Georgia,"Spectral",serif;letter-spacing:-.01em}
.byline{margin:10px 0 0;font-size:14px;color:var(--t3)}
.body{margin-top:24px}
.body p{margin:0 0 16px}
.facts{margin:28px 0 0;padding:18px;background:var(--s3);border-radius:14px;
  display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px}
.facts div{margin:0}
dt{font:500 10px/1 -apple-system,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--t3)}
dd{margin:7px 0 0;font-size:15px;font-weight:500}
.note{margin:10px 0 0;font-size:13px;line-height:1.55;color:var(--t3)}
.panel{margin-top:26px;padding-top:22px;border-top:1px solid var(--line)}
.panel h2{margin:0;font:600 12px/1 -apple-system,sans-serif;letter-spacing:.13em;text-transform:uppercase;color:var(--t3)}
.panel p{margin:11px 0 0;font-size:15px;color:var(--t2)}
footer{margin-top:34px;padding:18px;background:var(--s1);border-radius:14px}
footer p{margin:0;font-size:14px;line-height:1.6;color:var(--t2)}
footer strong{color:var(--t0)}
footer .note{margin-top:10px}
.empty{max-width:440px;margin:22vh auto 0;padding:0 20px;text-align:center}
.empty h1{font-size:22px}
.empty p{margin-top:14px;font-size:15px;color:var(--t2)}
@media (prefers-color-scheme:dark){
  :root{--bg:#0E1116;--s1:#181D24;--s3:#151A20;--line:#2A313A;
        --t0:#F5F7FA;--t2:#AAB4C0;--t3:#7A8593}
}
</style>
</head><body><main>${data.main}</main></body></html>`;
}

export const reportShareController = new ReportShareController();
export default reportShareController;
