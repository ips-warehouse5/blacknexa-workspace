/**
 * Published FAQs.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { FaqItem } from "@/mocks/types";

export const faqItems: FaqItem[] = [
  {
    id: "FAQ-201",
    question: "Who can see the incident reports I file?",
    category: "Privacy and Security",
    status: "Published",
    updated: "Aug 29, 2026",
    answer:
      "Every report has a privacy level you control: Private (only you), Trusted Circle (verified advocates, anonymized), or Community (public feed). You can change or delete your report at any time.",
  },
  {
    id: "FAQ-202",
    question: "Does BlackNexa provide legal advice?",
    category: "General",
    status: "Published",
    updated: "Aug 28, 2026",
    answer:
      "BlackNexa provides informational resources, evidence preservation tools, and community support. It does not provide formal legal advice. For active legal representation, please consult a licensed attorney.",
  },
  {
    id: "FAQ-203",
    question: "How does cryptographic timestamping protect my evidence?",
    category: "Reporting an Incident",
    status: "Published",
    updated: "Aug 26, 2026",
    answer:
      "When you upload files, BlackNexa generates a cryptographic hash that verifies the file has not been altered or modified since the exact moment of recording.",
  },
  {
    id: "FAQ-204",
    question: "Can I remain anonymous when posting comments or reports?",
    category: "Privacy and Security",
    status: "Published",
    updated: "Aug 24, 2026",
    answer:
      "Yes. You can enable 'Anonymous by default' in your profile preferences or toggle anonymity on individual reports and discussion replies.",
  },
  {
    id: "FAQ-205",
    question: "How do I connect with a verified legal advocate?",
    category: "Support and Resources",
    status: "Published",
    updated: "Aug 22, 2026",
    answer:
      "When filing an incident, select 'Share with Trusted Circle' to request triage assistance from credentialed civil rights advocates active on the platform.",
  },
  {
    id: "FAQ-206",
    question: "What happens if I delete my account?",
    category: "Account and Access",
    status: "Published",
    updated: "Aug 20, 2026",
    answer:
      "You can choose between severing your personal identity (retaining anonymous reports for community statistics) or requesting a hard purge where all sealed files and records are destroyed after 30 days.",
  },
  {
    id: "FAQ-207",
    question: "How are community flags and moderation reviews handled?",
    category: "General",
    status: "Draft",
    updated: "Aug 18, 2026",
    answer:
      "All reports flagged for threatening content, hate speech, or harassment are placed in the human moderation queue and reviewed under platform safety guidelines.",
  },
  {
    id: "FAQ-208",
    question: "What mobile platforms are currently supported?",
    category: "Account and Access",
    status: "Draft",
    updated: "Aug 15, 2026",
    answer:
      "BlackNexa is available on iOS (App Store) and Android (Google Play) with on-device biometric security vault capabilities.",
  },
];

export default faqItems;
