/**
 * Keyword rule shapes — `/api/v1/admin/moderation/keyword-rules`.
 *
 * Mirrors `KeywordRuleView` in `services/keyword_rules.service.ts` (contract
 * §2.10, plan §4.5 and D9). A rule is no longer the prototype's
 * `{title, pattern: "a, b, c"}` string: terms are a real list, and a rule says
 * what a match *does* — which is the whole point of D9. Victims quote threats,
 * so a blunt "hold on match" would hold the very reports the platform exists
 * for; `signal` hands the match to the AI as a hint instead, and only holds if
 * the AI confirms it or cannot answer.
 *
 * The term rules below restate the server's `validateRuleTerms` so the editor
 * can refuse a bad chip as it is typed. The server re-validates every write;
 * this copy only saves a round trip.
 */

import type { KeywordAction, PolicyCategory } from "@/features/moderation/moderation.types";

export type KeywordRuleKind = "system" | "custom";
export type KeywordAppliesTo = "all" | "reports" | "comments";

export interface KeywordRule {
  id: string;
  /** Unique among live rules, case-insensitively. */
  name: string;
  category: PolicyCategory;
  categoryLabel: string;
  /** 1–50 terms (a disabled seed may have none), each 2–80 characters; a trailing `*` matches a prefix. */
  terms: string[];
  action: KeywordAction;
  kind: KeywordRuleKind;
  appliesTo: KeywordAppliesTo;
  enabled: boolean;
  detectedCount: number;
  lastDetectedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export type KeywordActionFilter = KeywordAction | "all";
export type KeywordCategoryFilter = PolicyCategory | "all";

export interface KeywordRuleListParams {
  page: number;
  limit: number;
  search: string;
  action: KeywordActionFilter;
  category: KeywordCategoryFilter;
}

export interface CreateKeywordRuleInput {
  name: string;
  category: PolicyCategory;
  terms: string[];
  action?: KeywordAction;
  appliesTo?: KeywordAppliesTo;
  enabled?: boolean;
}

/** PATCH sends only what changed; the API refuses an empty body. */
export type UpdateKeywordRuleInput = Partial<CreateKeywordRuleInput>;

/** What each action does, in the words the table and the editor both use. */
export const KEYWORD_ACTION_HELP: Record<KeywordAction, string> = {
  hold: "Always holds matching content for a moderator.",
  signal: "Points the AI at the match; holds only if the AI confirms it or is unavailable.",
  monitor: "Records the match only — never holds anything.",
};

export const KEYWORD_ACTIONS: readonly KeywordAction[] = ["hold", "signal", "monitor"];

export const KEYWORD_APPLIES_TO_LABELS: Record<KeywordAppliesTo, string> = {
  all: "Reports & comments",
  reports: "Reports only",
  comments: "Comments only",
};

export const KEYWORD_APPLIES_TO: readonly KeywordAppliesTo[] = ["all", "reports", "comments"];

export const KEYWORD_KIND_LABELS: Record<KeywordRuleKind, string> = {
  system: "System rule",
  custom: "Custom rule",
};

export const TERM_LIMITS = { minChars: 2, maxChars: 80, maxTerms: 50 } as const;
export const RULE_NAME_LIMITS = { min: 2, max: 80 } as const;

/** Collapse whitespace the way the server does before comparing or storing a term. */
export function normaliseTerm(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** The comparison key: accents and case folded, so "Café" and "cafe" are one term. */
export function termKey(term: string): string {
  return normaliseTerm(term)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Why a term would be refused, or null when it is fine.
 *
 * Same order and meaning as `validateRuleTerms`: length, a `*` only at the very
 * end, at least one letter or digit, and at least two characters before a `*`
 * — `a*` would match half the language.
 */
export function termProblem(raw: string): string | null {
  const term = normaliseTerm(raw);
  if (term.length < TERM_LIMITS.minChars || term.length > TERM_LIMITS.maxChars) {
    return `A term must be ${TERM_LIMITS.minChars}–${TERM_LIMITS.maxChars} characters.`;
  }
  const stars = (term.match(/\*/g) ?? []).length;
  if (stars > 1 || (stars === 1 && !term.endsWith("*"))) {
    return "A * is only allowed at the end of a term.";
  }
  const stem = stars === 1 ? term.slice(0, -1) : term;
  const lettersAndDigits = stem.normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
  if (!lettersAndDigits) return "A term needs at least one letter or digit.";
  if (stars === 1 && lettersAndDigits.length < TERM_LIMITS.minChars) {
    return `A prefix term needs at least ${TERM_LIMITS.minChars} letters or digits before the *.`;
  }
  return null;
}
