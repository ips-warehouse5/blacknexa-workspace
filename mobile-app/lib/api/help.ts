export interface HelpFaqCategory {
  id: string;
  label: string;
}

export interface HelpFaqItem {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  startHere?: boolean;
}

export interface HelpFaqPayload {
  categories: HelpFaqCategory[];
  items: HelpFaqItem[];
}

export const FALLBACK_HELP_FAQ: HelpFaqPayload = {
  categories: [
    { id: "filing", label: "Filing a report" },
    { id: "evidence", label: "Evidence" },
    { id: "privacy", label: "Privacy" },
    { id: "account", label: "Account" },
  ],
  items: [
    {
      id: "evidence-safe",
      categoryId: "filing",
      question: "How is my evidence kept safe?",
      answer:
        "Files are encrypted on your device before they are uploaded, and sealed the moment they arrive. Only you and a moderator reviewing your report can open them, and every open is written into a record you can request at any time.",
      startHere: true,
    },
    {
      id: "after-report",
      categoryId: "filing",
      question: "What happens after I file a report?",
      answer:
        "Your report is saved to your Vault, then reviewed according to the visibility and location choices you selected while filing.",
      startHere: true,
    },
    {
      id: "anonymous-report",
      categoryId: "filing",
      question: "Can I file without giving my name?",
      answer:
        "Yes. You can stay anonymous by default or choose anonymity while filing a report. Moderators may still see who filed it when safety review requires it.",
      startHere: true,
    },
    {
      id: "report-review",
      categoryId: "filing",
      question: "Who reviews reports, and how long does it take?",
      answer:
        "Reports are reviewed by trained moderators and, when relevant, verified advocates. Review timing depends on volume and urgency.",
      startHere: true,
    },
    {
      id: "lawyer-share",
      categoryId: "filing",
      question: "What can I show a lawyer?",
      answer:
        "You can share the report details, timestamps, location precision, and the evidence record available from your Vault.",
      startHere: true,
    },
    {
      id: "corroborated",
      categoryId: "filing",
      question: 'What does "corroborated" mean?',
      answer:
        "It means another trusted signal supports part of the report. It does not replace review, context, or your own evidence.",
      startHere: true,
    },
    {
      id: "evidence-originals",
      categoryId: "evidence",
      question: "Can originals be changed after upload?",
      answer:
        "No. Evidence is sealed after upload so later changes would be visible in the record.",
    },
    {
      id: "privacy-change",
      categoryId: "privacy",
      question: "Can I change privacy later?",
      answer:
        "You can change your defaults any time. Reports already filed keep the privacy setting chosen at the time they were created.",
    },
    {
      id: "delete-account",
      categoryId: "account",
      question: "How do I delete my account?",
      answer:
        "Open Settings, go to Account, then choose Delete account. You will be asked to confirm before anything is removed.",
    },
  ],
};

export const helpApi = {
  async faq(): Promise<HelpFaqPayload> {
    // The backend FAQ endpoint is not available yet. Keeping this behind an API
    // function lets the screen stay data-driven when the endpoint is connected.
    return FALLBACK_HELP_FAQ;
  },
};
