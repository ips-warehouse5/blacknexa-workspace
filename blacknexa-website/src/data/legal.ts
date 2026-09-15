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
    body: "BlackNexa™ is not a government agency, law firm, or legal referral service. Generating intake filings or transmitting verified incident packages to researched agencies does not guarantee that any agency will initiate an investigation, take enforcement action, or grant relief. All intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.",
  },
  {
    label: "DISCLAIMER",
    body: "Blacknexa™ is a technology and software platform provider, not a law firm, legal representative, or government oversight agency. We do not provide legal advice, nor do we guarantee or control the response times, investigations, or actions of any third-party agencies, corporations, or civil authorities to which reports are submitted. BlackNexa provides secure technological tools and routing services designed solely to help users document incidents, organize data, and transmit reports to the appropriate entities so their voices can be heard.",
  },
];

export const privacySections: LegalSection[] = [
  {
    n: "1",
    id: "p-collect",
    title: "What we collect",
    body: [
      "Account details you give us: email address, optional phone number, and the display name you choose. Nothing more is required to use BlackNexa.",
      "Incident records you create: media files, the GPS coordinates and timestamps captured at the moment of recording, the category you select, and the agencies you choose to receive the report.",
    ],
  },
  {
    n: "2",
    id: "p-use",
    title: "How we use it",
    body: [
      "To seal and store your records, to transmit reports to the recipients you select, and to send the alerts you asked for. We do not profile you and we do not sell data.",
    ],
  },
  {
    n: "3",
    id: "p-seal",
    title: "Evidence sealing and integrity",
    body: [
      "Each record is hashed at creation. The hash travels with the file so a recipient can confirm the record has not been altered since capture.",
    ],
  },
  {
    n: "4",
    id: "p-share",
    title: "When information is shared",
    body: [
      "Only where you direct it: the corporate entity, oversight organisation or public agency you name when you submit a report. We also disclose where the law compels us to, and we tell you when we are permitted to.",
    ],
  },
  {
    n: "5",
    id: "p-retain",
    title: "Retention and deletion",
    body: [
      "Records stay in your vault until you delete them. Deleting a record removes it from our systems; copies already transmitted to a recipient are outside our control.",
    ],
  },
  {
    n: "6",
    id: "p-rights",
    title: "Your rights",
    body: [
      "Access, correct, export or delete your data from inside the app, or by writing to us. We answer verified requests within thirty days.",
    ],
  },
  {
    n: "7",
    id: "p-security",
    title: "Security",
    body: ["Files are encrypted in transit and at rest. Access to production systems is limited, logged and reviewed."],
  },
  {
    n: "8",
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
      "Transmitting a report does not guarantee that any agency will open an investigation, take enforcement action, or grant relief. All intake and investigative decisions remain strictly under the independent authority of the respective government bodies and oversight entities.",
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
    body: ["Your records are yours. You grant us the limited licence needed to store, seal and transmit them as you direct."],
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

export const legalUpdated = "12 August 2026";
