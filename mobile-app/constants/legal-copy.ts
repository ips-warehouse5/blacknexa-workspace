/**
 * The Terms and Privacy copy shown on screen A7.
 *
 * Sections 1–3 of the Terms are transcribed from the artboard itself, so what a
 * person agrees to in the app is the text the design specified rather than a
 * paraphrase. The remaining sections and the Privacy document follow the same
 * voice: plain, second person, and each one naming its own consequence.
 *
 * ── This is product copy, not legal advice ─────────────────────────────────
 * It needs a lawyer's pass before release, and `LEGAL_VERSION` must be bumped
 * when it changes: every acceptance is recorded against a version, and A7 is
 * re-shown when the stored version is behind.
 */

export const LEGAL_VERSION = 1;

export interface LegalSection {
  heading: string;
  body: string;
}

/** Verbatim from the A7 artboard for 1–3; consistent in voice for the rest. */
export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "1. What this app does",
    body:
      "BlackNexa helps people document, discuss and learn from experiences of discrimination, profiling and civil-rights incidents. You can file a report, preserve evidence, reach community resources and connect with trusted advocates.",
  },
  {
    heading: "2. Your responsibilities",
    body:
      "Be honest and truthful. Do not post content that is illegal, violent or defamatory, or that puts another person at risk. Do not share someone else's private information without their consent.",
  },
  {
    heading: "3. Evidence integrity",
    body:
      "Files you upload are sealed on arrival so a later change would be detectable. This is a safeguard, not a promise that a court will accept them.",
  },
  {
    heading: "4. What we do not do",
    body:
      "We are not a law firm and we do not give legal advice. Nothing you file is sent to any outside organisation unless you choose to dispatch it. We never contact an employer, a landlord or a police department on your behalf.",
  },
  {
    heading: "5. Moderation",
    body:
      "A moderator reads every report before it is marked verified, and reads every flag. A report can be dismissed if the evidence does not support it. You will be told when that happens and why.",
  },
  {
    heading: "6. Emergencies",
    body:
      "This app is not an emergency service. If someone is in immediate danger, contact your local emergency number first. Document afterwards.",
  },
  {
    heading: "7. Ending your account",
    body:
      "You can delete your account at any time from Profile. You choose whether the reports you filed are deleted with it or kept as anonymous community record with your identity removed.",
  },
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "1. What we collect",
    body:
      "Your email address, the display name you choose, and what you put in a report. Nothing else is required. We do not collect contacts, advertising identifiers or browsing history.",
  },
  {
    heading: "2. Filing anonymously",
    body:
      "Filing anonymously means your report publishes without your name or photo. It does not mean we do not know who filed it: moderators can still see the author, because a report with no accountable source cannot be verified.",
  },
  {
    heading: "3. Location",
    body:
      "You choose how precisely each report shows its location — exact, approximate, or hidden. Approximate publishes an area about 500 metres across. Hidden publishes no coordinates at all. The precise value is stored encrypted and is visible only to you and to moderators.",
  },
  {
    heading: "4. Evidence",
    body:
      "Photos, video, audio and documents are stored encrypted. Location and camera metadata are stripped before the file is stored. Access is granted through short-lived links, never a public address.",
  },
  {
    heading: "5. Who can see a report",
    body:
      "Public means anyone in the community feed. Trusted Circle means verified advocates only. Private means only you. You set a default and can change it per report.",
  },
  {
    heading: "6. Notifications",
    body:
      "Four kinds only: your report changing status, someone corroborating or replying, a dispatch being ready, and urgent safety notices for your area. No digests, no marketing, no engagement nudges.",
  },
  {
    heading: "7. Deleting things",
    body:
      "Deleting a report removes it from the feed and from your Vault immediately. Sealed files are destroyed after thirty days — a window that exists so an accidental deletion or a moderation dispute can still be resolved.",
  },
  {
    heading: "8. Getting your data",
    body:
      "You can export everything you have filed from Profile at any time, in a format you can read without this app.",
  },
];
