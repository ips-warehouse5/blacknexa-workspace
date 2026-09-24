/**
 * The keyword stage of the moderation pipeline — pure text matching.
 *
 * docs/INCIDENT_MODULE_PLAN.md §4.5, §5.3 step 3, D8 and D9. Three jobs live
 * here, and nothing else:
 *
 *   1. **Rule matching** — admin-managed `keyword_rules` terms matched against a
 *      report's title, body and location label, or a comment's body.
 *   2. **Built-in contact-detail detectors** — email, phone, SSN and payment
 *      card numbers, run on comments only (report bodies are regex-scrubbed at
 *      filing, so a detector there would only ever see redaction markers).
 *   3. **The verbatim-evidence check** — D8's rule that a flagged item may be
 *      auto-hidden only when the AI's evidence quote really is in the content.
 *
 * ── Why this file is pure ─────────────────────────────────────────────────
 * No env, no models, no logger: the only import is the dependency-free
 * moderation vocabulary. The golden-corpus test (`npm test`) runs this matcher
 * over realistic civil-rights narratives without a database or a `.env`, and the
 * pure policy module (`moderation_policy.ts`) imports the verbatim check. The
 * rule *cache* — which does touch the database — is `keyword_rules.service.ts`.
 *
 * ── Why phrases and word boundaries (D9) ──────────────────────────────────
 * The old family filter matched single words, so "the officer threatened to
 * shoot" was blocked for "shoot", and "skilled" could never have been told
 * apart from "kill" by a substring search. Here a term matches only as whole
 * words: both the text and the term are folded to the same normal form and
 * split into word tokens (runs of letters and digits in any script), and a term
 * matches when its tokens appear consecutively in the text. Punctuation and line
 * breaks between words do not matter ("I will — kill you!" matches "i will kill
 * you"); letters glued onto a word do ("kys" does not match "kyss").
 *
 * A trailing `*` makes the last word a prefix: `threaten*` matches "threatened"
 * and "threatening". It is the only wildcard, and only at the end (§4.5).
 *
 * Scripts written without spaces between words (Chinese, Japanese, Thai, Lao,
 * Khmer, Burmese) have no word boundaries to match on, so a term containing one
 * of those scripts is matched as a plain substring of the folded text instead.
 *
 * ── Normal form ───────────────────────────────────────────────────────────
 * NFKC (full-width and compatibility forms become plain ones), lower case,
 * accents stripped (NFD, then combining marks dropped), invisible format
 * characters dropped (zero-width spaces and joiners, soft hyphens, bidi
 * controls — the classic way to slip "k​ys" past a filter), whitespace
 * collapsed. Deliberately *no* leetspeak undoing: mapping digits to letters
 * would make badge and complaint numbers match words, and an evasion the rules
 * miss is still in front of the AI.
 *
 * ── What a hit records ────────────────────────────────────────────────────
 * The rule's id, name, category and action, the rule term that matched and the
 * field it matched in — never the member's text around it. For the built-in
 * detectors the "term" is the detector's label ("phone number"), not the number:
 * run rows must not become a second copy of anyone's private details.
 */

import {
  isPolicyCategory,
  type KeywordAction,
  type KeywordField,
  type KeywordHit,
  type PolicyCategory,
} from "@/types/moderation.interface";

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────────

/** Combining marks, removed after NFD so "é" matches "e". */
const COMBINING_MARKS = /\p{M}+/gu;
/** Invisible format characters: ZWSP/ZWJ/ZWNJ, soft hyphen, bidi controls, BOM. */
const FORMAT_CHARACTERS = /\p{Cf}+/gu;
/** A word token: a run of letters and digits in any script. */
const WORD_TOKEN = /[\p{L}\p{N}]+/gu;
/** A single letter or digit — used for boundary checks. */
const WORD_CHAR = /[\p{L}\p{N}]/u;
/** Scripts written without spaces between words. */
const SCRIPTIO_CONTINUA =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

/**
 * Fold text to the matcher's normal form (see the file header). Whitespace is
 * collapsed to single spaces and trimmed; punctuation is kept, so the verbatim
 * check can still compare punctuation, while `tokenise` drops it.
 */
export function foldText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(FORMAT_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The folded text's word tokens, in order. */
export function tokenise(raw: string | null | undefined): string[] {
  return foldText(raw).match(WORD_TOKEN) ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule matching
// ─────────────────────────────────────────────────────────────────────────────

/** A keyword rule as the matcher needs it. `id` is null only for code rules. */
export interface MatchableRule {
  id: string | null;
  name: string;
  category: PolicyCategory;
  action: KeywordAction;
  terms: readonly string[];
}

/** One term, pre-folded so a run does not re-normalise every rule. */
export interface CompiledTerm {
  /** The term as the admin wrote it — what a hit records. */
  term: string;
  /** What is searched for in the prepared haystack. */
  needle: string;
  /** Trailing `*`: the last word is a prefix. */
  prefix: boolean;
  /** No word boundaries (scriptio continua): a plain substring match. */
  unbounded: boolean;
}

export interface CompiledRule {
  id: string | null;
  name: string;
  category: PolicyCategory;
  action: KeywordAction;
  terms: CompiledTerm[];
}

/**
 * Pre-fold a term. Returns null for a term that has no letters or digits once
 * folded ("!!", "*") — such a term can never match and the validator refuses it
 * on write, but a legacy or hand-edited row must not match everything either.
 */
export function compileTerm(raw: string): CompiledTerm | null {
  const trimmed = raw.trim();
  const prefix = trimmed.endsWith("*");
  const stem = prefix ? trimmed.slice(0, -1) : trimmed;
  const tokens = tokenise(stem);
  if (tokens.length === 0) return null;
  const joined = tokens.join(" ");
  if (SCRIPTIO_CONTINUA.test(joined)) {
    return { term: trimmed, needle: joined, prefix, unbounded: true };
  }
  // The haystack is " tok tok tok ", so a leading space pins the start of the
  // first word and a trailing space pins the end of the last one. A prefix term
  // simply omits the trailing space.
  return { term: trimmed, needle: prefix ? ` ${joined}` : ` ${joined} `, prefix, unbounded: false };
}

/** Compile a rule's terms once, for the rule cache. */
export function compileRule(rule: MatchableRule): CompiledRule {
  const terms: CompiledTerm[] = [];
  const seen = new Set<string>();
  for (const raw of rule.terms) {
    if (typeof raw !== "string") continue;
    const compiled = compileTerm(raw);
    if (!compiled) continue;
    const key = `${compiled.needle}|${compiled.prefix}|${compiled.unbounded}`;
    if (seen.has(key)) continue;
    seen.add(key);
    terms.push(compiled);
  }
  return { id: rule.id, name: rule.name, category: rule.category, action: rule.action, terms };
}

/** The fields a target offers the matcher. Comments have only a `body`. */
export type MatchFields = Partial<Record<KeywordField, string | null | undefined>>;

/** Field order in hits: the order a moderator reads a report. */
const FIELD_ORDER: readonly KeywordField[] = ["title", "body", "locationLabel"];

/**
 * An upper bound on hits per run. `keyword_hits` is JSONB on every run row and
 * the AI takes at most 20 signals; a pathological rule set must not turn one
 * run into a megabyte of hits.
 */
export const MAX_KEYWORD_HITS = 100;

interface Haystack {
  bounded: string;
  unbounded: string;
}

function prepare(text: string | null | undefined): Haystack | null {
  const tokens = tokenise(text);
  if (tokens.length === 0) return null;
  const joined = tokens.join(" ");
  return { bounded: ` ${joined} `, unbounded: joined };
}

function termMatches(haystack: Haystack, term: CompiledTerm): boolean {
  return term.unbounded
    ? haystack.unbounded.includes(term.needle)
    : haystack.bounded.includes(term.needle);
}

/**
 * Match compiled rules against a target's fields. One hit per (rule, term,
 * field), in field order, then rule order, then term order; capped at
 * `MAX_KEYWORD_HITS`.
 */
export function matchKeywords(fields: MatchFields, rules: readonly CompiledRule[]): KeywordHit[] {
  const hits: KeywordHit[] = [];
  for (const field of FIELD_ORDER) {
    const haystack = prepare(fields[field]);
    if (!haystack) continue;
    for (const rule of rules) {
      for (const term of rule.terms) {
        if (!termMatches(haystack, term)) continue;
        hits.push({
          ruleId: rule.id,
          ruleName: rule.name,
          category: rule.category,
          term: term.term,
          field,
          action: rule.action,
        });
        if (hits.length >= MAX_KEYWORD_HITS) return hits;
      }
    }
  }
  return hits;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule term validation — §4.5 (shared by the admin CRUD and the tests)
// ─────────────────────────────────────────────────────────────────────────────

export const RULE_TERM_LIMITS = {
  minTerms: 1,
  maxTerms: 50,
  minChars: 2,
  maxChars: 80,
} as const;

export type TermValidation = { ok: true; terms: string[] } | { ok: false; error: string };

/**
 * Validate and tidy a rule's terms (§4.5): 1–50 terms, each 2–80 characters
 * after trimming, whitespace collapsed, duplicates (after folding) dropped. A
 * `*` is allowed only as the very last character, and what precedes it must
 * still be at least two characters of letters or digits — `a*` would match half
 * the language.
 */
export function validateRuleTerms(raw: unknown): TermValidation {
  if (!Array.isArray(raw)) return { ok: false, error: "Terms must be a list." };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") return { ok: false, error: "Every term must be text." };
    const term = entry.replace(/\s+/g, " ").trim();
    if (term.length < RULE_TERM_LIMITS.minChars || term.length > RULE_TERM_LIMITS.maxChars) {
      return {
        ok: false,
        error: `Each term must be ${RULE_TERM_LIMITS.minChars}–${RULE_TERM_LIMITS.maxChars} characters: "${term.slice(0, 80)}".`,
      };
    }
    const starCount = (term.match(/\*/g) ?? []).length;
    if (starCount > 1 || (starCount === 1 && !term.endsWith("*"))) {
      return { ok: false, error: `A * is only allowed at the end of a term: "${term}".` };
    }
    const stem = starCount === 1 ? term.slice(0, -1) : term;
    const folded = tokenise(stem).join(" ");
    if (!folded) {
      return { ok: false, error: `A term needs at least one letter or digit: "${term}".` };
    }
    if (starCount === 1 && folded.replace(/ /g, "").length < RULE_TERM_LIMITS.minChars) {
      return {
        ok: false,
        error: `A prefix term needs at least ${RULE_TERM_LIMITS.minChars} characters before the *: "${term}".`,
      };
    }
    const key = `${folded}${starCount === 1 ? "*" : ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  if (out.length < RULE_TERM_LIMITS.minTerms || out.length > RULE_TERM_LIMITS.maxTerms) {
    return {
      ok: false,
      error: `A rule needs ${RULE_TERM_LIMITS.minTerms}–${RULE_TERM_LIMITS.maxTerms} distinct terms.`,
    };
  }
  return { ok: true, terms: out };
}

/** Narrow a stored category, falling back to `other` for anything unknown. */
export function ruleCategory(raw: unknown): PolicyCategory {
  return isPolicyCategory(raw) ? raw : "other";
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in contact-detail detectors — §4.5 (comments only, action `signal`)
// ─────────────────────────────────────────────────────────────────────────────

export type ContactDetector = "email" | "phone" | "ssn" | "card";

/** The detector's label — recorded as the hit's `term` and sent to the AI. */
export const DETECTOR_TERMS: Readonly<Record<ContactDetector, string>> = {
  email: "email address",
  phone: "phone number",
  ssn: "social security number",
  card: "payment card number",
};

const DETECTOR_RULE_NAMES: Readonly<Record<ContactDetector, string>> = {
  email: "Built-in: email address",
  phone: "Built-in: phone number",
  ssn: "Built-in: social security number",
  card: "Built-in: payment card number",
};

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/u;

/**
 * US SSN in its written form — three groups with one consistent separator —
 * excluding the ranges the SSA never issues (000, 666, 9xx; 00; 0000). Bare
 * nine-digit runs are indistinguishable from phone numbers and handled there.
 */
const SSN =
  /(?<![\p{L}\p{N}-])(?!000|666|9\d\d)\d{3}([- ])(?!00)\d{2}\1(?!0000)\d{4}(?![\p{L}\p{N}-])/gu;

/** A digit run with single separators, long enough to be a card (13–19 digits). */
const CARD_CANDIDATE = /(?<![\p{L}\p{N}])\d(?:[ -]?\d){12,18}(?![\p{L}\p{N}])/gu;

/** A phone-shaped run: digits with spaces, dots, dashes or parentheses between. */
const PHONE_CANDIDATE = /(?<![\p{L}\p{N}])[+(]?\d[\d ().-]{6,24}\d(?![\p{L}\p{N}])/gu;

/**
 * §4.5: a phone-shaped number is *not* a phone number when it follows
 * `case|complaint|report|incident|badge|ref|#` — complaint references, badge
 * numbers and incident numbers are exactly what a genuine report quotes. Up to
 * two connector words are allowed in between ("case number is 2024…",
 * "complaint ref no. 88…").
 */
const REFERENCE_CONTEXT =
  /(?:\b(?:case|complaint|report|incident|badge|ref|reference)s?\b|#)[^\p{L}\p{N}]*(?:(?:no|nos|num|number|nr|id|ref|reference|is|was)\b[^\p{L}\p{N}]*){0,2}$/u;

/** Characters of preceding text inspected for a reference context. */
const REFERENCE_WINDOW = 48;

/** Luhn checksum over 13–19 digits, refusing runs of one repeated digit. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function isYear(group: string): boolean {
  return /^(19|20)\d{2}$/.test(group);
}

function inRange(group: string, min: number, max: number): boolean {
  if (!/^\d{1,2}$/.test(group)) return false;
  const n = Number(group);
  return n >= min && n <= max;
}

/**
 * A date with a four-digit year somewhere in the digit groups — "2024-05-12 10"
 * or "12.05.2024 1030" — is a timestamp, not a phone number. Two-digit-year
 * dates are left alone on purpose: "06 12 34 56 78" is a French mobile number.
 */
function containsDate(groups: readonly string[]): boolean {
  for (let i = 0; i + 2 < groups.length; i += 1) {
    const [a, b, c] = [groups[i], groups[i + 1], groups[i + 2]];
    if (isYear(a) && inRange(b, 1, 12) && inRange(c, 1, 31)) return true;
    if (inRange(a, 1, 31) && inRange(b, 1, 31) && isYear(c)) return true;
  }
  return false;
}

/**
 * Plausible phone digit grouping: 9–15 digits (E.164 allows 15), at most six
 * groups, and a one-digit group only as a leading country or trunk code — so
 * "1 2 3 4 5 6 7 8 9" in a list is not a phone number.
 */
function phoneShaped(candidate: string): boolean {
  const groups = candidate.match(/\d+/g) ?? [];
  const digits = groups.join("");
  if (digits.length < 9 || digits.length > 15) return false;
  if (groups.length > 6) return false;
  if (groups.slice(1).some((group) => group.length === 1)) return false;
  if (containsDate(groups)) return false;
  return true;
}

function overlaps(start: number, end: number, spans: ReadonlyArray<[number, number]>): boolean {
  return spans.some(([s, e]) => start < e && end > s);
}

function detectorHit(detector: ContactDetector, field: KeywordField): KeywordHit {
  return {
    ruleId: null,
    ruleName: DETECTOR_RULE_NAMES[detector],
    category: "private_info",
    term: DETECTOR_TERMS[detector],
    field,
    action: "signal",
  };
}

/**
 * Which contact-detail detectors fire on a text. At most one hit per detector
 * (a comment with three phone numbers is one signal, not three). Order: email,
 * SSN, card, phone. A number counted as an SSN or card is not also a phone.
 */
export function detectContactDetails(
  text: string | null | undefined,
  field: KeywordField = "body",
): KeywordHit[] {
  if (!text) return [];
  // NFKC so full-width digits and "＠" count; case folded for the context regex.
  const normal = text.normalize("NFKC").replace(FORMAT_CHARACTERS, "");
  const lower = normal.toLowerCase();
  const found = new Set<ContactDetector>();
  const claimed: Array<[number, number]> = [];

  if (EMAIL.test(normal)) found.add("email");

  for (const match of normal.matchAll(SSN)) {
    const start = match.index ?? 0;
    claimed.push([start, start + match[0].length]);
    found.add("ssn");
  }

  for (const match of normal.matchAll(CARD_CANDIDATE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, claimed)) continue;
    if (luhnValid(match[0].replace(/\D/g, ""))) {
      claimed.push([start, end]);
      found.add("card");
    }
  }

  for (const match of normal.matchAll(PHONE_CANDIDATE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, claimed)) continue;
    if (!phoneShaped(match[0])) continue;
    const before = lower.slice(Math.max(0, start - REFERENCE_WINDOW), start);
    if (REFERENCE_CONTEXT.test(before)) continue;
    found.add("phone");
    break;
  }

  const order: ContactDetector[] = ["email", "ssn", "card", "phone"];
  return order.filter((d) => found.has(d)).map((d) => detectorHit(d, field));
}

// ─────────────────────────────────────────────────────────────────────────────
// The verbatim-evidence check — D8
// ─────────────────────────────────────────────────────────────────────────────

/** The shortest evidence quote that can justify an auto-hide, after folding. */
export const MIN_VERBATIM_CHARS = 3;

/**
 * The control characters the engine's prescreen removes before the model reads
 * the content (`ai-engine app/core/prompt_safety.py` `_CONTROL_CHARS`: C0
 * controls except tab, newline and carriage return, plus DEL). A quote the model
 * copies never contains them, so the content is compared without them too.
 * Zero-width and bidi characters (the prescreen's other strip) are `\p{Cf}`,
 * which `foldText` already removes.
 */
const ENGINE_STRIPPED_CONTROLS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/**
 * Fold for the verbatim comparison: the matcher's normal form, plus the
 * typographic variants a model tends to substitute when it copies a quote —
 * curly quotes, primes, the various dashes — mapped to their plain forms.
 */
export function foldForVerbatim(raw: string | null | undefined): string {
  return foldText(raw ? raw.replace(ENGINE_STRIPPED_CONTROLS, "") : raw)
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, "-");
}

function charBefore(text: string, index: number): string {
  if (index <= 0) return "";
  const code = text.charCodeAt(index - 1);
  // A low surrogate: step back over the whole astral code point.
  if (code >= 0xdc00 && code <= 0xdfff && index >= 2) return text.slice(index - 2, index);
  return text.charAt(index - 1);
}

function charAfter(text: string, index: number): string {
  if (index >= text.length) return "";
  const cp = text.codePointAt(index);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

/**
 * D8: is the AI's evidence quote really a verbatim part of the content?
 *
 * The engine is asked to copy its quote exactly; this re-checks the claim in
 * Node rather than trusting it, because an auto-hide of published content must
 * rest on words the author actually wrote — not on a paraphrase, a hallucinated
 * sentence, or a "quote" steered by an injection attempt. The comparison
 * forgives only presentation: case, accents, whitespace, typographic quotes and
 * dashes, and quote marks or an ellipsis the model wrapped around the quote.
 * The match must also sit on word boundaries, so "kill" is not found inside
 * "skilled". An ellipsis *inside* the quote (elided words) is not verbatim, and
 * the answer is then `false` — the safe direction: the content is kept.
 */
export function verbatimInContent(
  evidence: string | null | undefined,
  contents: ReadonlyArray<string | null | undefined>,
): boolean {
  if (!evidence) return false;
  const needle = foldForVerbatim(evidence)
    .replace(/^(?:["'\s]|\.\.\.)+/, "")
    .replace(/(?:["'\s]|\.\.\.)+$/, "")
    .trim();
  if (needle.length < MIN_VERBATIM_CHARS || !WORD_CHAR.test(needle)) return false;

  const startsWithWord = WORD_CHAR.test(charAfter(needle, 0));
  const endsWithWord = WORD_CHAR.test(charBefore(needle, needle.length));

  for (const content of contents) {
    if (!content) continue;
    const haystack = foldForVerbatim(content);
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      const leftOk = !startsWithWord || !WORD_CHAR.test(charBefore(haystack, at));
      const rightOk = !endsWithWord || !WORD_CHAR.test(charAfter(haystack, end));
      if (leftOk && rightOk) return true;
      from = at + 1;
    }
  }
  return false;
}
