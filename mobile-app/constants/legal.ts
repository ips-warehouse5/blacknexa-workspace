export const LEGAL_VERSION = 1;

export type LegalSection = { heading: string; body: string };

export const TERMS: { title: string; updated: string; sections: LegalSection[]; footer: string } = {
  title: "BlackNexa\u2122 \u2014 Terms of Service",
  updated: "Effective 2026",
  sections: [
    {
      heading: "1. What this app does",
      body: "BlackNexa\u2122 helps people document, discuss, and learn from experiences of discrimination, profiling, and civil-rights incidents. You can report incidents, preserve evidence, access community resources, and connect with trusted advocates.",
    },
    {
      heading: "2. Your responsibilities",
      body: "Be respectful, honest, and truthful. Do not post content that is illegal, violent, defamatory, or that puts others at risk. Do not share another person\u2019s private information without their consent.",
    },
    {
      heading: "3. Data you provide",
      body: "We collect the incident details and media you choose to submit, plus minimal device data needed to operate the app securely. Sensitive details (like exact GPS) can be redacted by you at any time. See the Privacy Policy for full details.",
    },
    {
      heading: "4. How we use content",
      body: "You own the content you submit. You grant BlackNexa\u2122 a limited, revocable license to host, display, and transmit it strictly to operate the app and to honor the privacy choices you set per report (private, trusted circle, or public).",
    },
    {
      heading: "5. Evidence integrity",
      body: "Reports may be cryptographically timestamped to preserve chain-of-custody. This is a technical safeguard \u2014 it is not a guarantee of legal admissibility.",
    },
    {
      heading: "6. No legal advice",
      body: "BlackNexa\u2122 provides information, resources, and community support. It does not provide legal advice. For your specific situation, please consult a licensed attorney or trusted advocacy organization.",
    },
    {
      heading: "7. Liability",
      body: "To the maximum extent allowed by law, BlackNexa\u2122 is not liable for indirect, incidental, or consequential damages arising from use of the app. The service is provided \u201cas is\u201d.",
    },
    {
      heading: "8. Governing law",
      body: "These terms are governed by the laws of the United States and the state in which BlackNexa\u2122 is organized, without regard to conflict-of-law principles.",
    },
    {
      heading: "9. Trademark notice",
      body: "BlackNexa\u2122 is a trademark of BlackNexa with an application pending before the United States Patent and Trademark Office (USPTO). All brand assets, logos, and platform content are protected intellectual property.",
    },
    {
      heading: "10. Changes",
      body: "We may update these terms. When we do, we will notify you in-app and ask you to accept the updated version before continuing to use protected features.",
    },
  ],
  footer: "Questions: legal@blacknexa.app",
};

export const PRIVACY: { title: string; updated: string; sections: LegalSection[]; footer: string } = {
  title: "BlackNexa\u2122 \u2014 Privacy Policy",
  updated: "Effective 2026",
  sections: [
    {
      heading: "1. What we collect",
      body: "Account basics (display name), incident reports you create, media you attach, and minimal device data. We collect location only when you enable it for a specific report.",
    },
    {
      heading: "2. How we use your data",
      body: "To run the app, protect your account, document incidents, surface relevant resources, and improve safety. Aggregate, anonymized insights may be used to advocate for community outcomes.",
    },
    {
      heading: "3. Sharing controls",
      body: "Every report has a privacy level you control: Private (only you), Trusted Circle (verified advocates, anonymized), or Community (public feed). You can change or delete a report at any time.",
    },
    {
      heading: "4. Location handling",
      body: "Exact GPS is treated as high-sensitivity data. When \u201cRedact precise location\u201d is on, public posts show only an approximate area. You can toggle this per report.",
    },
    {
      heading: "5. Security",
      body: "Data is encrypted in transit. Sensitive evidence is stored with access controls. Biometric unlock can be enabled to protect your vault on-device.",
    },
    {
      heading: "6. Your rights",
      body: "You can request access, correction, export, or deletion of your data, subject to safety and legal-compliance obligations. Use \u201cExport my data\u201d in Profile or contact us.",
    },
    {
      heading: "7. Children",
      body: "BlackNexa\u2122 is not directed to children under 13. We do not knowingly collect personal data from children without verifiable parental consent.",
    },
    {
      heading: "8. Third parties",
      body: "We do not sell your personal data. Limited service providers (hosting, error reporting) process data only under our instructions and confidentiality.",
    },
    {
      heading: "9. Changes",
      body: "If we make material changes to this policy, we will notify you in-app and request renewed consent before continuing.",
    },
  ],
  footer: "Privacy questions: privacy@blacknexa.app",
};
