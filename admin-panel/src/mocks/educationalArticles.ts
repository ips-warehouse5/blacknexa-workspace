/**
 * Rights & guidance articles.
 *
 * Lifted verbatim from the approved prototype so that the ported screens show
 * exactly what was signed off. Replaced by a real endpoint when this module is
 * wired up — the typing is the domain shape, not the fixture's shape, so the
 * screen does not change when that happens.
 */

import type { EducationalArticle } from "@/mocks/types";

export const educationalArticles: EducationalArticle[] = [
  {
    id: "ART-101",
    title: "Know Your Rights During a Police Stop",
    category: "User Rights",
    status: "Published",
    updated: "Aug 30, 2026",
    content:
      "You have the constitutional right to remain silent. If you are stopped by law enforcement, you do not have to answer questions about where you are going or what you are doing.\n\n1. Stay calm and keep your hands visible at all times.\n2. Ask clearly: 'Am I being detained, or am I free to go?'\n3. If detained, state calmly: 'I choose to remain silent and I want to speak with an attorney.'\n4. You do not have to consent to a search of your person or your belongings without a warrant.",
  },
  {
    id: "ART-102",
    title: "Preserving Video and Audio Evidence Securely",
    category: "Incident Guidance",
    status: "Published",
    updated: "Aug 28, 2026",
    content:
      "Preserving digital evidence immediately after an incident is critical to protecting the chain of custody.\n\n• Record uninterrupted footage with clear wide shots of badge numbers and patrol vehicle tags.\n• Upload recordings to the BlackNexa Vault to create a cryptographically sealed, timestamped record.\n• Do not edit, filter, or trim video metadata before securing your primary copy.",
  },
  {
    id: "ART-103",
    title: "Understanding Precise GPS vs Approximate Area Redaction",
    category: "Privacy Rights",
    status: "Published",
    updated: "Aug 25, 2026",
    content:
      "When publishing incident reports to the public community feed, your safety and residential privacy are our top priority.\n\nBy default, BlackNexa applies coordinate rounding (~500m area jitter) so a report filed on a residential street cannot disclose your exact doorstep or household. You can toggle this setting in your profile or per report.",
  },
  {
    id: "ART-104",
    title: "De-escalation Strategies and Community Safety",
    category: "Safety Guidance",
    status: "Draft",
    updated: "Aug 22, 2026",
    content:
      "Practical de-escalation methods for witnesses and bystanders during public encounters:\n\n1. Maintain a safe physical distance (at least 10 feet).\n2. Document audibly and calmly without obstructing official duties.\n3. Note names and contact info of fellow witnesses on site.",
  },
  {
    id: "ART-105",
    title: "Workplace Discrimination: Documenting Adverse Actions",
    category: "User Rights",
    status: "Draft",
    updated: "Aug 20, 2026",
    content:
      "Steps for documenting discriminatory workplace practices, unequal discipline, and retaliatory measures under Title VII and local employment laws.",
  },
  {
    id: "ART-106",
    title: "Tenant Protections Against Unlawful Evictions",
    category: "Incident Guidance",
    status: "Published",
    updated: "Aug 15, 2026",
    content:
      "Landlords cannot lock you out, shut off utilities, or seize property without a formal court order. Learn your local statutory rights and how to file emergency stays.",
  },
];

export default educationalArticles;
