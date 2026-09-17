export type LegalSection = {
  n: string;
  id: string;
  title: string;
  body: string[];
};

export const disclaimers: { label: string; body: string }[] = [
  {
    label: "SERVICE DISCLAIMER",
    body: "BlackNexa™ provides automated evidence vaulting, location resolution, and dynamic agency matching tools.",
  },
  {
    label: "DISCLAIMER",
    body: "BlackNexa™ is not a government agency, law firm, or legal referral service. Generating intake filings or routing verified incident packages to researched agencies does not guarantee that any agency will initiate an investigation, take enforcement action, or grant relief. All intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.",
  },
  {
    label: "DISCLAIMER",
    body: "Blacknexa™ is a technology and software platform provider, not a law firm, legal representative, or government oversight agency. We do not provide legal advice, nor do we guarantee or control the response times, investigations, or actions of any third-party agencies, corporations, or civil authorities to which reports are submitted. BlackNexa provides secure technological tools and routing services designed solely to help users document incidents, organize data, and create a verifiable record identifying the appropriate entities so their voices can be heard.",
  },
];

export const privacySections: LegalSection[] = [
  {
    n: "1",
    id: "p-collect",
    title: "What we collect",
    body: [
      "Account details you give us: your email address and the display name you choose. If you sign in with Apple or Google, we receive the name and email address those providers share with your permission.",
      "Incident records you create: media files (photo, video, or audio) you attach as evidence, the GPS location and timestamp captured at the moment of recording (you control the precision — see \"Location precision\" below), the category you select, and the country or agency context used to route the record.",
      "Device and session data needed to keep your account secure: a per-device session record so you can review or sign out individual devices, and a push-notification token if you enable alerts.",
      "Biometric unlock (Face ID / fingerprint), if you turn it on, is verified entirely on your device by your phone's operating system. BlackNexa never receives, stores, or transmits your biometric data — we only receive a yes/no confirmation that your device unlocked.",
      "We do not use advertising, analytics, or tracking SDKs of any kind, and BlackNexa does not request permission to track you across other apps or websites.",
    ],
  },
  {
    n: "2",
    id: "p-use",
    title: "How we use it",
    body: [
      "To create and secure your account, to seal, store, and let you manage your incident records, to route a record toward the agency or jurisdiction context you select, and to send the alerts you asked for.",
      "We do not build advertising profiles, we do not use your data to train third-party models, and we do not sell or share your data for cross-context behavioural advertising (as those terms are defined under CCPA/CPRA).",
    ],
  },
  {
    n: "3",
    id: "p-seal",
    title: "Evidence sealing and integrity",
    body: [
      "Each piece of evidence is hashed (SHA-256) on your device at the moment you attach it, and again by our servers when it's stored. The two hashes are compared so we — and you — can confirm the file arrived exactly as captured, with nothing altered in between.",
      "Incident records are sealed with AES-256-GCM encryption before they leave your device. Where end-to-end sealing is active for a record, the encryption key is derived from a secret only you hold and never leaves your device — our servers store the sealed data but cannot open it.",
    ],
  },
  {
    n: "4",
    id: "p-location",
    title: "Location precision",
    body: [
      "BlackNexa only accesses your location while you are actively using the app (\"when in use\") — never in the background, and we do not track your movement over time.",
      "For each record, you choose one of three precision levels: Exact (the spot you picked), Approximate (rounded to about 500 metres), or Hidden (no location published at all). You can also set a default precision for future records in your profile.",
    ],
  },
  {
    n: "5",
    id: "p-dispatch",
    title: "How records are routed to agencies",
    body: [
      "When you select an agency or jurisdiction for a record, BlackNexa creates a verifiable, time-stamped routing record identifying that agency and the channel associated with it. This documents your intent and gives you a durable, tamper-evident reference for the record.",
      "BlackNexa does not currently transmit the record to the agency's own systems on your behalf, and we do not control or guarantee that any agency receives, reviews, or acts on it. Where a direct transmission channel exists for a given agency, we will state that explicitly for that agency; otherwise, treat the routing record as documentation you control and can share yourself.",
    ],
  },
  {
    n: "6",
    id: "p-share",
    title: "When information is shared",
    body: [
      "We do not share your incident data with third parties for their own purposes, and we do not sell data.",
      "We share information only: with service providers who process it strictly on our behalf and under contract (cloud storage for encrypted files, email delivery for account and verification messages, and push-notification delivery for alerts you enabled); where the law compels us to; or where you direct us to, such as sharing a record yourself outside the app.",
      "We tell you when we are legally permitted to disclose that a compelled disclosure occurred.",
      "General news and informational content in the app may be generated or translated using a third-party AI service. This applies only to editorial/news content — your incident records and evidence are never sent to that service.",
    ],
  },
  {
    n: "7",
    id: "p-retain",
    title: "Retention and deletion",
    body: [
      "Records stay in your vault until you delete them.",
      "Deleting an individual incident record permanently removes it, its evidence, and its routing record from our systems — this is a genuine, irreversible deletion, not a soft delete.",
      "Deleting your account removes your account, sessions, and consents immediately. For records you filed, you choose: unlink your identity from them while the record remains (anonymised), or erase them, which schedules the evidence for permanent removal within our published retention window. One minimal audit entry, identified only by a one-way hash of your email address, is retained to confirm the deletion occurred.",
    ],
  },
  {
    n: "8",
    id: "p-rights",
    title: "Your rights",
    body: [
      "Access, correct, export, or delete your data from inside the app, or by writing to us. You can delete your account entirely from within the app at any time.",
      "We answer verified requests within thirty days. Depending on where you live, this may include rights under laws such as the GDPR or CCPA/CPRA; we honour equivalent requests regardless of location.",
      "We process your data because it's necessary to provide the service you asked for — creating your account, sealing and storing your records, and sending the alerts you enabled. Where we rely on your consent instead (for example, an optional feature), you can withdraw that consent at any time.",
      "If you're in the European Economic Area, the UK, or Switzerland, you also have the right to lodge a complaint with your local data protection supervisory authority.",
      "BlackNexa is a US company, and your information may be processed in the United States and other countries where our service providers operate, which may have different data protection laws than your own. Where we transfer personal data out of the European Economic Area, the UK, or Switzerland, we use recognised safeguards such as Standard Contractual Clauses. We apply the protections described in this policy wherever your data is processed.",
    ],
  },
  {
    n: "9",
    id: "p-security",
    title: "Security",
    body: [
      "Files are encrypted in transit and at rest, and evidence is additionally sealed with AES-256-GCM as described above. Access to production systems is limited to authorised personnel and reviewed.",
      "We do not store raw IP addresses for abuse-prevention checks — they are cryptographically hashed before use.",
    ],
  },
  {
    n: "10",
    id: "p-children",
    title: "Children's privacy",
    body: [
      "BlackNexa is not directed at children and is not intended for use by anyone under 13. We do not knowingly collect data from children under 13. If you believe a child under 13 has provided us data, contact us and we will remove it.",
    ],
  },
  {
    n: "11",
    id: "p-sensitive",
    title: "Sensitive information",
    body: [
      "Incident records you create may describe or contain evidence of sensitive matters, including allegations of crime or misconduct. We treat all incident records as sensitive: they are sealed and encrypted as described above, access is restricted to what's needed to operate the service, and we do not use them for advertising, analytics, or profiling of any kind.",
    ],
  },
  {
    n: "12",
    id: "p-controller",
    title: "Who we are",
    body: [
      "BlackNexa is operated by NEWSMOVESMARKETSFOREX LLC, 6303 Waterford District Dr Ste 4002361, Miami, FL 33126-6002, United States. For any privacy question or request, write to legal@blacknexa.com.",
    ],
  },
  {
    n: "13",
    id: "p-changes",
    title: "Changes to this policy",
    body: [
      "We post the revised policy here with a new date and, for material changes, notify you in the app and by email before they take effect.",
    ],
  },
];

export const termsSections: LegalSection[] = [
  {
    n: "1",
    id: "t-accept",
    title: "Acceptance",
    body: [
      "By creating an account or using BlackNexa you agree to these terms. If you do not agree, do not use the platform.",
    ],
  },
  {
    n: "2",
    id: "t-what",
    title: "What BlackNexa is — and is not",
    body: [
      "BlackNexa™ is a technology and software platform provider, not a law firm, legal representative, legal referral service, or government oversight agency. We do not provide legal advice.",
      "BlackNexa creates a verifiable, time-stamped record documenting a report and the agency or jurisdiction context you select; this does not guarantee that any agency will receive, review, open an investigation into, take enforcement action on, or grant relief for it. All intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.",
    ],
  },
  {
    n: "3",
    id: "t-account",
    title: "Your account",
    body: ["Keep your credentials secure and your contact details current. You are responsible for activity under your account."],
  },
  {
    n: "4",
    id: "t-conduct",
    title: "Acceptable use",
    body: [
      "Do not submit knowingly false records, impersonate another person, or use the platform to harass. Fabricated reports damage the credibility every user depends on and will end your access.",
    ],
  },
  {
    n: "5",
    id: "t-content",
    title: "Your content",
    body: ["Your records are yours. You grant us the limited licence needed to store, seal and route them as you direct."],
  },
  {
    n: "6",
    id: "t-ip",
    title: "Our intellectual property",
    body: ["The BlackNexa name, mark and software are protected. Nothing here transfers ownership of them to you."],
  },
  {
    n: "7",
    id: "t-liability",
    title: "Disclaimers and limits of liability",
    body: [
      "The platform is provided as-is. To the extent the law allows, we are not liable for indirect or consequential loss arising from third-party responses, or the absence of a response, to a submitted report.",
    ],
  },
  {
    n: "8",
    id: "t-law",
    title: "Governing law",
    body: [
      "These terms are governed by the laws of the United States and the state in which BlackNexa is incorporated. Disputes are resolved in those courts.",
    ],
  },
  {
    n: "9",
    id: "t-disclaimers",
    title: "Full disclaimers",
    body: disclaimers.map((d) => d.body),
  },
];

export const legalUpdated = "17 September 2026";
