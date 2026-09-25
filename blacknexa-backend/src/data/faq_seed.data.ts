/**
 * Initial FAQ content.
 *
 * Reconciled from the three lists that existed before this table did:
 *
 *   • `blacknexa-website/src/data/faq.ts` — nine pre-launch answers aimed at
 *     someone deciding whether to join the waitlist;
 *   • `mobile-app/lib/api/help.ts` — nine in-app answers aimed at someone who
 *     is already using the product and needs to do something;
 *   • `admin-panel/src/mocks/faqItems.ts` — eight design fixtures that were
 *     never shown anywhere.
 *
 * They overlapped but did not agree, which is the whole reason for the table.
 * Every entry below carries the surfaces it belongs on: "What will it cost?" is
 * a website question and makes no sense in an app the reader has already
 * installed, while "What happens after I file a report?" is the reverse. The
 * answers that serve both — anonymity, evidence handling, deletion — carry both,
 * so an editor changes them once.
 *
 * Wording is preserved verbatim from whichever list already shipped it, so
 * switching each surface to the API changes no copy on that surface. Where the
 * two lists answered the same question differently, the published surface's
 * wording wins and the other surface simply gains the better answer.
 *
 * This is seed data, not a fixture: after the first run the table is the source
 * of truth and this file is only consulted again by `--reset`.
 */

import type { FaqStatus, FaqSurface } from "@/types/faq.interface";

export interface FaqCategorySeed {
  id: string;
  label: string;
  sortOrder: number;
}

export interface FaqSeed {
  categoryId: string;
  question: string;
  answer: string;
  surfaces: FaqSurface[];
  status?: FaqStatus;
  startHere?: boolean;
}

/**
 * Categories.
 *
 * The mobile screen's four (`filing`, `evidence`, `privacy`, `account`) plus the
 * two the other lists needed — a place for pre-launch questions, and one for
 * getting help from a person. The console's fixture labels ("Privacy and
 * Security", "Support and Resources") are used where they are the better name,
 * since they were written for an editor to read.
 */
export const FAQ_CATEGORY_SEED: FaqCategorySeed[] = [
  { id: "general", label: "General", sortOrder: 10 },
  { id: "filing", label: "Filing a report", sortOrder: 20 },
  { id: "evidence", label: "Evidence", sortOrder: 30 },
  { id: "privacy", label: "Privacy and security", sortOrder: 40 },
  { id: "account", label: "Account and access", sortOrder: 50 },
  { id: "support", label: "Support and resources", sortOrder: 60 },
];

export const FAQ_SEED: FaqSeed[] = [
  // ── General ───────────────────────────────────────────────────────────────
  {
    categoryId: "general",
    question: "What exactly is BlackNexa?",
    // Client-supplied copy (24 Sep 2026). Plain text: the app renders `\n` but
    // not Markdown, so the client's bold labels are written as "Label:".
    answer: [
      "BlackNexa™ is a groundbreaking, God-centered ecosystem that combines a global social network with a social justice platform, designed to protect, connect, and empower Black, brown, and underserved communities. In plain terms, it is a mobile application that acts as both a digital shield for your personal safety and a wholesome digital home for your community.",
      "What the App Does:",
      "• The Godly Community Feed & Social Network: This is the heart of the app's social side. Spanning across local towns, U.S. cities, and international borders worldwide, it is a safe, peaceful space where people can connect, discuss business, share everyday life, and address social or political issues—all conducted in a godly manner with mutual respect, keeping God's commandments, and loving our neighbor as ourselves.",
      "• The Injustice Pocket Recorder & Systemic Protection: If you ever face systemic racism, racial profiling, or unfair public encounters, this tool puts power directly back into the hands of the people. With a single tap, it records video while automatically locking in unalterable GPS coordinates, timestamps, and metadata. By capturing undeniable, objective evidence of systemic injustice on the spot, it prevents these incidents from being swept under the rug, deters misconduct through transparent accountability, and ensures accountability is enforced.",
      "• Encrypted Evidence Vault & Automated Routing: Your captured recordings are securely backed up and structured so they can be automatically routed to the appropriate oversight bodies, human rights regulatory agencies, and legal advocates who have the authority to act on what you report.",
      "• AI Fact-Check News Engine: A smart news engine that cuts straight through media spin and systemic bias to give you clear, fact-driven information on important topics.",
    ].join("\n\n"),
    surfaces: ["website", "app"],
    startHere: true,
  },
  {
    categoryId: "general",
    question: "When does the app launch?",
    answer:
      "We are in pre-launch now, with iOS and Android at release. Join the waitlist and you get the download alert the moment we hit the Apple App Store and Google Play.",
    // Pre-launch only, and meaningless to someone reading it inside the app.
    surfaces: ["website"],
  },
  {
    categoryId: "general",
    question: "What will it cost?",
    answer:
      "Pricing at launch is being finalised. Waitlist members are told first, before any public announcement.",
    surfaces: ["website"],
  },
  {
    categoryId: "general",
    question: "Does BlackNexa provide legal advice?",
    answer:
      "No. BlackNexa provides informational resources, evidence preservation tools, and community support. It does not provide formal legal advice. For active legal representation, please consult a licensed attorney.",
    surfaces: ["website", "app"],
  },
  {
    categoryId: "general",
    question: "Which countries does it work in?",
    answer:
      "Automated AI geographic research connects users anywhere in the world with the local, state, national and international oversight authorities relevant to their incident, so it works domestically and internationally.",
    surfaces: ["website", "app"],
  },
  {
    categoryId: "general",
    question: "How is the news verified?",
    answer:
      "Every story is backed by three to five factual sources and reviewed daily by our editorial team, focused on Black business, technology, economic power and faith-based content.",
    surfaces: ["website", "app"],
  },
  {
    categoryId: "general",
    question: "What mobile platforms are currently supported?",
    answer:
      "BlackNexa is available on iOS (App Store) and Android (Google Play) with on-device biometric security vault capabilities.",
    surfaces: ["website"],
    // Carried over from the console fixtures as a draft: it describes a shipped
    // state the product has not reached, so it must not go live by being seeded.
    status: "draft",
  },

  // ── Filing a report ───────────────────────────────────────────────────────
  {
    categoryId: "filing",
    question: "What happens after I file a report?",
    answer:
      "Your report is saved to your Vault, then reviewed according to the visibility and location choices you selected while filing.",
    surfaces: ["app"],
    startHere: true,
  },
  {
    categoryId: "filing",
    question: "Can I file without giving my name?",
    answer:
      "Yes. You can stay anonymous by default or choose anonymity while filing a report. Moderators may still see who filed it when safety review requires it.",
    surfaces: ["app"],
    startHere: true,
  },
  {
    categoryId: "filing",
    question: "Who reviews reports, and how long does it take?",
    answer:
      "Reports are reviewed by trained moderators and, when relevant, verified advocates. Review timing depends on volume and urgency.",
    surfaces: ["app"],
    startHere: true,
  },
  {
    categoryId: "filing",
    question: "Does filing a report guarantee an investigation?",
    answer:
      "No. BlackNexa is a technology and software platform provider, not a government agency, law firm or legal referral service. We document, secure and route your report; all intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.",
    surfaces: ["website", "app"],
    startHere: true,
  },
  {
    categoryId: "filing",
    question: "What can I show a lawyer?",
    answer:
      "You can share the report details, timestamps, location precision, and the evidence record available from your Vault.",
    surfaces: ["app"],
    startHere: true,
  },
  {
    categoryId: "filing",
    question: 'What does "corroborated" mean?',
    answer:
      "It means another trusted signal supports part of the report. It does not replace review, context, or your own evidence.",
    surfaces: ["app"],
    startHere: true,
  },
  {
    categoryId: "filing",
    question: "How are community flags and moderation reviews handled?",
    answer:
      "All reports flagged for threatening content, hate speech, or harassment are placed in the human moderation queue and reviewed under platform safety guidelines.",
    surfaces: ["app", "website"],
  },

  // ── Evidence ──────────────────────────────────────────────────────────────
  {
    categoryId: "evidence",
    question: "How is my evidence kept safe?",
    answer:
      "Files are encrypted on your device before they are uploaded, and sealed the moment they arrive. Only you and a moderator reviewing your report can open them, and every open is written into a record you can request at any time.",
    surfaces: ["app"],
    startHere: true,
  },
  {
    categoryId: "evidence",
    question: "How is my evidence protected?",
    answer:
      "Files are encrypted in transit and at rest in the secure vault. Each record is hashed at creation alongside its GPS coordinates and timestamp, so a recipient can confirm it has not been altered since capture.",
    surfaces: ["website"],
  },
  {
    categoryId: "evidence",
    question: "Can originals be changed after upload?",
    answer:
      "No. Evidence is sealed after upload so later changes would be visible in the record.",
    surfaces: ["app", "website"],
  },
  {
    categoryId: "evidence",
    question: "How does cryptographic timestamping protect my evidence?",
    answer:
      "When you upload files, BlackNexa generates a cryptographic hash that verifies the file has not been altered or modified since the exact moment of recording.",
    surfaces: ["app", "website"],
  },

  // ── Privacy and security ──────────────────────────────────────────────────
  {
    categoryId: "privacy",
    question: "Can I post anonymously?",
    answer:
      "The community feed supports anonymous posts. Reports routed to an agency carry the detail that agency requires in order to act.",
    surfaces: ["website"],
  },
  {
    categoryId: "privacy",
    question: "Can I remain anonymous when posting comments or reports?",
    answer:
      "Yes. You can enable 'Anonymous by default' in your profile preferences or toggle anonymity on individual reports and discussion replies.",
    surfaces: ["app"],
  },
  {
    categoryId: "privacy",
    question: "Who can see the incident reports I file?",
    answer:
      "Every report has a privacy level you control: Private (only you), Trusted Circle (verified advocates, anonymized), or Community (public feed). You can change or delete your report at any time.",
    surfaces: ["app", "website"],
  },
  {
    categoryId: "privacy",
    question: "Can I change privacy later?",
    answer:
      "You can change your defaults any time. Reports already filed keep the privacy setting chosen at the time they were created.",
    surfaces: ["app"],
  },

  // ── Account and access ────────────────────────────────────────────────────
  {
    categoryId: "account",
    question: "How do I delete my account?",
    answer:
      "Open Settings, go to Account, then choose Delete account. You will be asked to confirm before anything is removed.",
    surfaces: ["app"],
  },
  {
    categoryId: "account",
    question: "What happens if I delete my account?",
    answer:
      "You can choose between severing your personal identity (retaining anonymous reports for community statistics) or requesting a hard purge where all sealed files and records are destroyed after 30 days.",
    surfaces: ["app", "website"],
  },

  // ── Support and resources ─────────────────────────────────────────────────
  {
    categoryId: "support",
    question: "How do I reach you about partnership or press?",
    answer:
      "Write to advertising@blacknexa.com for partnerships and advertising, media@blacknexa.com for media, or support@blacknexa.com for legal matters. The contact form reaches the same people.",
    surfaces: ["website", "app"],
  },
  {
    categoryId: "support",
    question: "How do I connect with a verified legal advocate?",
    answer:
      "When filing an incident, select 'Share with Trusted Circle' to request triage assistance from credentialed civil rights advocates active on the platform.",
    surfaces: ["app", "website"],
  },
];

export default FAQ_SEED;
