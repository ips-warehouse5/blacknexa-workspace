/**
 * Privacy Policy / Terms of Service shown on the standalone viewer screens
 * (app/legal/privacy.tsx, app/legal/terms.tsx).
 *
 * Kept in sync by hand with blacknexa-website/src/data/legal.ts — that copy
 * was audited against this app's actual code (permissions, data collected,
 * encryption, agency-dispatch behavior, account deletion) and against Google
 * Play / Apple App Store policy requirements, so this file should mirror it
 * rather than drift into its own wording. If you edit one, edit the other.
 *
 * Note: constants/legal-copy.ts is a SEPARATE, shorter set of copy shown
 * during sign-up consent (screen A7) and describes some features (report
 * visibility levels, moderation) this pass didn't audit — it was
 * deliberately left alone rather than guessed at. See its own doc comment.
 */

export const LEGAL_VERSION = 1;

export type LegalSection = { heading: string; body: string };

export const TERMS: {
  title: string;
  updated: string;
  sections: LegalSection[];
  footer: string;
} = {
  title: "BlackNexa™ — Terms of Service",
  updated: "Updated 17 September 2026",
  sections: [
    {
      heading: "1. Acceptance",
      body: "By creating an account or using BlackNexa you agree to these terms. If you do not agree, do not use the platform.",
    },
    {
      heading: "2. What BlackNexa is — and is not",
      body: "BlackNexa™ is a technology and software platform provider, not a law firm, legal representative, legal referral service, or government oversight agency. We do not provide legal advice.\n\nBlackNexa creates a verifiable, time-stamped record documenting a report and the agency or jurisdiction context you select; this does not guarantee that any agency will receive, review, open an investigation into, take enforcement action on, or grant relief for it. All intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.",
    },
    {
      heading: "3. Your account",
      body: "Keep your credentials secure and your contact details current. You are responsible for activity under your account.",
    },
    {
      heading: "4. Acceptable use",
      body: "Do not submit knowingly false records, impersonate another person, or use the platform to harass. Fabricated reports damage the credibility every user depends on and will end your access.",
    },
    {
      heading: "5. Your content",
      body: "Your records are yours. You grant us the limited licence needed to store, seal, and route them as you direct.",
    },
    {
      heading: "6. Our intellectual property",
      body: "The BlackNexa name, mark, and software are protected. Nothing here transfers ownership of them to you.",
    },
    {
      heading: "7. Disclaimers and limits of liability",
      body: "The platform is provided as-is. To the extent the law allows, we are not liable for indirect or consequential loss arising from third-party responses, or the absence of a response, to a submitted report.",
    },
    {
      heading: "8. Governing law",
      body: "These terms are governed by the laws of the United States and the state in which BlackNexa is incorporated. Disputes are resolved in those courts.",
    },
    {
      heading: "9. Full disclaimers",
      body: "BlackNexa™ provides automated evidence vaulting, location resolution, and dynamic agency matching tools.\n\nBlackNexa™ is not a government agency, law firm, or legal referral service. Generating intake filings or routing verified incident packages to researched agencies does not guarantee that any agency will initiate an investigation, take enforcement action, or grant relief. All intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.\n\nBlacknexa™ is a technology and software platform provider, not a law firm, legal representative, or government oversight agency. We do not provide legal advice, nor do we guarantee or control the response times, investigations, or actions of any third-party agencies, corporations, or civil authorities to which reports are submitted. BlackNexa provides secure technological tools and routing services designed solely to help users document incidents, organize data, and create a verifiable record identifying the appropriate entities so their voices can be heard.",
    },
  ],
  footer: "Questions: legal@blacknexa.com",
};

export const PRIVACY: {
  title: string;
  updated: string;
  sections: LegalSection[];
  footer: string;
} = {
  title: "BlackNexa™ — Privacy Policy",
  updated: "Updated 24 September 2026",
  sections: [
    {
      heading: "1. What we collect",
      body: "Account details you give us: your email address and the display name you choose. If you sign in with Apple or Google, we receive the name and email address those providers share with your permission.\n\nIncident records you create: media files (photo, video, or audio) you attach as evidence, the GPS location and timestamp captured at the moment of recording (you control the precision — see “Location precision” below), the category you select, and the country or agency context used to route the record.\n\nDevice and session data needed to keep your account secure: a per-device session record so you can review or sign out individual devices, and a push-notification token if you enable alerts.\n\nBiometric unlock (Face ID / fingerprint), if you turn it on, is verified entirely on your device by your phone's operating system. BlackNexa never receives, stores, or transmits your biometric data — we only receive a yes/no confirmation that your device unlocked.\n\nWe do not use advertising, analytics, or tracking SDKs of any kind, and BlackNexa does not request permission to track you across other apps or websites.",
    },
    {
      heading: "2. How we use it",
      body: "To create and secure your account, to seal, store, and let you manage your incident records, to route a record toward the agency or jurisdiction context you select, and to send the alerts you asked for.\n\nWe do not build advertising profiles, we do not use your data to train third-party models, and we do not sell or share your data for cross-context behavioural advertising (as those terms are defined under CCPA/CPRA).",
    },
    {
      heading: "3. Evidence sealing and integrity",
      body: "Each piece of evidence is hashed (SHA-256) on your device at the moment you attach it, and again by our servers when it's stored. The two hashes are compared so we — and you — can confirm the file arrived exactly as captured, with nothing altered in between.\n\nIncident records are sealed with AES-256-GCM encryption before they leave your device. Where end-to-end sealing is active for a record, the encryption key is derived from a secret only you hold and never leaves your device — our servers store the sealed data but cannot open it.",
    },
    {
      heading: "4. Location precision",
      body: "BlackNexa only accesses your location while you are actively using the app (“when in use”) — never in the background, and we do not track your movement over time.\n\nFor each record, you choose one of three precision levels: Exact (the spot you picked), Approximate (rounded to about 500 metres), or Hidden (no location published at all). You can also set a default precision for future records in your profile.",
    },
    {
      heading: "5. How records are routed to agencies",
      body: "When you select an agency or jurisdiction for a record, BlackNexa creates a verifiable, time-stamped routing record identifying that agency and the channel associated with it. This documents your intent and gives you a durable, tamper-evident reference for the record.\n\nBlackNexa does not currently transmit the record to the agency's own systems on your behalf, and we do not control or guarantee that any agency receives, reviews, or acts on it. Where a direct transmission channel exists for a given agency, we will state that explicitly for that agency; otherwise, treat the routing record as documentation you control and can share yourself.",
    },
    {
      heading: "6. When information is shared",
      body: "We do not share your incident data with third parties for their own purposes, and we do not sell data.\n\nWe share information only: with service providers who process it strictly on our behalf and under contract (cloud storage for encrypted files, email delivery for account and verification messages, and push-notification delivery for alerts you enabled); where the law compels us to; or where you direct us to, such as sharing a record yourself outside the app.\n\nWe tell you when we are legally permitted to disclose that a compelled disclosure occurred.\n\nGeneral news and informational content in the app may be generated or translated using a third-party AI service. This applies only to editorial/news content — your incident records and evidence are never sent to that service.",
    },
    {
      heading: "7. Retention and deletion",
      body: "Records stay in your vault until you delete them.\n\nDeleting an individual incident record permanently removes it, its evidence, and its routing record from our systems — this is a genuine, irreversible deletion, not a soft delete.\n\nDeleting your account removes your account, sessions, and consents immediately. For records you filed, you choose: unlink your identity from them while the record remains (anonymised), or erase them, which schedules the evidence for permanent removal within our published retention window. One minimal audit entry, identified only by a one-way hash of your email address, is retained to confirm the deletion occurred.",
    },
    {
      heading: "8. Your rights",
      body: "Access, correct, export, or delete your data from inside the app, or by writing to us. You can delete your account entirely from within the app at any time.\n\nWe answer verified requests within thirty days. Depending on where you live, this may include rights under laws such as the GDPR or CCPA/CPRA; we honour equivalent requests regardless of location.\n\nWe process your data because it's necessary to provide the service you asked for — creating your account, sealing and storing your records, and sending the alerts you enabled. Where we rely on your consent instead (for example, an optional feature), you can withdraw that consent at any time.\n\nIf you're in the European Economic Area, the UK, or Switzerland, you also have the right to lodge a complaint with your local data protection supervisory authority.\n\nBlackNexa is a US company, and your information may be processed in the United States and other countries where our service providers operate, which may have different data protection laws than your own. Where we transfer personal data out of the European Economic Area, the UK, or Switzerland, we use recognised safeguards such as Standard Contractual Clauses. We apply the protections described in this policy wherever your data is processed.",
    },
    {
      heading: "9. Security",
      body: "Files are encrypted in transit and at rest, and evidence is additionally sealed with AES-256-GCM as described above. Access to production systems is limited to authorised personnel and reviewed.\n\nWe do not store raw IP addresses for abuse-prevention checks — they are cryptographically hashed before use.",
    },
    {
      heading: "10. Children's privacy",
      body: "BlackNexa is not directed at children and is not intended for use by anyone under 13. We do not knowingly collect data from children under 13. If you believe a child under 13 has provided us data, contact us and we will remove it.",
    },
    {
      heading: "11. Sensitive information",
      body: "Incident records you create may describe or contain evidence of sensitive matters, including allegations of crime or misconduct. We treat all incident records as sensitive: they are sealed and encrypted as described above, access is restricted to what's needed to operate the service, and we do not use them for advertising, analytics, or profiling of any kind.",
    },
    {
      heading: "12. Who we are",
      // Client-supplied copy (24 Sep 2026). `**…**` renders bold and `_…_` italic
      // on the Privacy screen, matching the client's formatting.
      body: `**BlackNexa™** is a trademark-pending brand and proprietary software ecosystem owned and licensed exclusively by **News Moves Markets Forex LLC**.\n\n**Scope of Protection:** The intellectual property, name, logo, underlying utility architecture (including the Injustice Pocket Recorder, AI Fact-Check News Engine, and global Community Feed), and brand rights are legally protected under United States trademark law (Serial Number: 99385360) covering software services (Class 042) and personal, legal, and social networking services (Class 045), and (Serial Number: 50068604) covering Downloadable computer application software for mobile phones, namely, software for allowing users to upload video, audio, multimedia, and text content to a community, social networking, and media site on the topic of news, current events, black and brown culture, and social justice; Downloadable computer application software for mobile phones, namely, software for allowing users to view video, audio, multimedia, and text content on the topic of news, current events, black and brown culture, and social justice; Downloadable software for social networking (Class 009).\n\n**Licensing Entity:** All rights, brand distribution, and platform developments are managed and operated under the authority of News Moves Markets Forex LLC.`,
    },
    {
      heading: "13. Changes to this policy",
      body: "We post the revised policy here with a new date and, for material changes, notify you in the app and by email before they take effect.",
    },
  ],
  footer: "Privacy questions: legal@blacknexa.com",
};
