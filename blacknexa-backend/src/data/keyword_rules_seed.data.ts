/**
 * The keyword rules `db:migrate:moderation` seeds — docs/INCIDENT_MODULE_PLAN.md §4.5.
 *
 * The six titles are the admin prototype's rule names, so the console's Keyword
 * Rules screen opens on the list the design shows. Every seed is `kind:
 * system`, `action: signal`, `applies_to: all`:
 *
 *   • **signal, never hold (D9).** Victims quote threats. "He said he would
 *     handle it ourselves" is a report *about* vigilantism, and a rule that held
 *     it outright would hold exactly the harassment reports the platform exists
 *     for. A `signal` hit is sent to the AI as a hint and holds only if the AI
 *     confirms the category — or cannot answer. Admins keep `hold` as the strict
 *     option for rules they write themselves.
 *   • **Phrases, not words.** The old family filter matched single words, so
 *     "kill" or "shoot" in "the officer threatened to shoot" blocked a genuine
 *     account. Every term here is a phrase that is rarely innocent.
 *   • **Hate Speech & Discrimination ships empty and disabled.** Slur lists are
 *     locale-specific and a crude English list would fire on reports that quote
 *     the slur used against the author; the AI covers the category, and admins
 *     add locale terms when they have them.
 *
 * Seeded by name, only when absent (soft-deleted rows included, so a seed an
 * admin deleted stays deleted). After the first run the table is the source of
 * truth. This module imports only the pure moderation vocabulary, so the
 * keyword-matcher tests can load the seeds without an environment.
 */

import type { PolicyCategory } from "@/types/moderation.interface";

export interface KeywordRuleSeed {
  name: string;
  category: PolicyCategory;
  terms: string[];
  enabled: boolean;
}

export const KEYWORD_RULE_SEEDS: readonly KeywordRuleSeed[] = [
  {
    name: "Direct Threat & Violence",
    category: "threat",
    terms: [
      "i will kill you",
      "we will kill",
      "going to kill him",
      "going to kill her",
      "we know where you live",
      "handle it ourselves",
      "burn it down",
    ],
    enabled: true,
  },
  {
    name: "Harassment & Bullying",
    category: "harassment",
    terms: [
      "go kill yourself",
      "kys",
      "everyone report her",
      "everyone report him",
      "spam his page",
      "spam her page",
    ],
    enabled: true,
  },
  {
    name: "Hate Speech & Discrimination",
    category: "hate",
    terms: [],
    enabled: false,
  },
  {
    name: "Private Details / Doxxing",
    category: "private_info",
    terms: [
      "his home address is",
      "her home address is",
      "lives at number",
      "his phone number is",
      "her phone number is",
    ],
    enabled: true,
  },
  {
    name: "Misleading or Untrue Content",
    category: "misleading",
    terms: ["just trolling", "not a real report", "this is a joke report"],
    enabled: true,
  },
  {
    name: "Spam or Advertising",
    category: "spam",
    terms: [
      "buy crypto",
      "promo code",
      "dm me on telegram",
      "whatsapp me",
      "forex signals",
      "click the link in my bio",
    ],
    enabled: true,
  },
];
