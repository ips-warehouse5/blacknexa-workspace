/**
 * Unit tests for the keyword stage — `npm test`, no `.env`, no database.
 *
 * docs/INCIDENT_MODULE_PLAN.md §4.5 and D8/D9:
 *   • normalisation and whole-word matching, trailing-`*` prefix terms;
 *   • the built-in detectors (email, phone with the reference-number skip
 *     rule, SSN, Luhn-valid cards);
 *   • rule term validation;
 *   • the verbatim-evidence check behind auto-hide;
 *   • the GOLDEN CORPUS — realistic civil-rights narratives and comments that
 *     quote threats, give hotline numbers, complaint and badge numbers and
 *     officers' names. The seeded rules must produce zero `hold` hits on them,
 *     and the policy must approve every one when the AI has assessed it clean.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_KEYWORD_HITS,
  compileRule,
  compileTerm,
  detectContactDetails,
  foldText,
  luhnValid,
  matchKeywords,
  tokenise,
  validateRuleTerms,
  verbatimInContent,
  type CompiledRule,
} from "./moderation_keyword_matcher";
import { decide, type PolicyInput } from "./moderation_policy";
import { KEYWORD_RULE_SEEDS } from "../data/keyword_rules_seed.data";
import {
  POLICY_CATEGORIES,
  type AiAssessment,
  type KeywordHit,
  type ModerationTargetType,
} from "../types/moderation.interface";

// ── Helpers ─────────────────────────────────────────────────────────────────

function rule(terms: string[], action: "hold" | "signal" | "monitor" = "signal", name = "Test rule"): CompiledRule {
  return compileRule({ id: `rule-${name}`, name, category: "threat", action, terms });
}

function matches(text: string, terms: string[]): boolean {
  return matchKeywords({ body: text }, [rule(terms)]).length > 0;
}

/** The seeds exactly as `db:migrate:moderation` writes them: `action: signal`. */
const SEEDED_RULES: CompiledRule[] = KEYWORD_RULE_SEEDS.filter((seed) => seed.enabled).map((seed, index) =>
  compileRule({
    id: `seed-${index}`,
    name: seed.name,
    category: seed.category,
    action: "signal",
    terms: seed.terms,
  }),
);

function cleanAssessment(): AiAssessment {
  return {
    status: "assessed",
    recommendation: "approve",
    confidence: 0.95,
    categories: POLICY_CATEGORIES.map((code) => ({
      code,
      violation: false,
      confidence: 0.03,
      severity: "low" as const,
      evidence: null,
      evidenceEnglish: null,
    })),
    safetyRisk: "none",
    summary: "A first-hand account of an incident.",
    injectionSuspected: false,
    blockReason: null,
    language: "en",
    imagesAssessed: 0,
    meta: { runId: "0".repeat(32), model: "test", policyVersion: "test", durationMs: 1 },
  };
}

function policyInput(targetType: ModerationTargetType, hits: KeywordHit[]): PolicyInput {
  return {
    mode: "content",
    trigger: targetType === "comment" ? "comment" : "filed",
    targetType,
    authorActive: true,
    contentReadable: true,
    contentTruncated: false,
    keywordHits: hits,
    ai: { status: "assessed", assessment: cleanAssessment() },
    media: { photoIds: [], unassessableIds: [] },
    contentTexts: [],
    humanClearedCurrentVersion: false,
    autoHiddenCurrentVersion: false,
    thresholds: { autoApproveMinConfidence: 0.8, violationMinConfidence: 0.5, flagAutohideMinConfidence: 0.85 },
    fallbacks: { reportAiFallback: "hold", commentAiFallback: "approve", unassessedMedia: "review" },
  };
}

// ── Normalisation ───────────────────────────────────────────────────────────

test("foldText: NFKC, lower case, accents stripped, invisible characters dropped, whitespace collapsed", () => {
  assert.equal(foldText("  Café DÉJÀ   vu\n\tNOW "), "cafe deja vu now");
  assert.equal(foldText("ＫＹＳ"), "kys"); // full-width
  assert.equal(foldText("k​ys"), "kys"); // zero-width space
  assert.equal(foldText("pro­mo code"), "promo code"); // soft hyphen
  assert.equal(foldText(null), "");
});

test("tokenise: words in any script, punctuation dropped", () => {
  assert.deepEqual(tokenise("I will — KILL you!!"), ["i", "will", "kill", "you"]);
  assert.deepEqual(tokenise("Él dijo: «te voy a matar»"), ["el", "dijo", "te", "voy", "a", "matar"]);
});

// ── Matching ────────────────────────────────────────────────────────────────

test("a phrase matches across case, punctuation and line breaks", () => {
  assert.ok(matches("He said: I WILL, kill you.", ["i will kill you"]));
  assert.ok(matches("we know\nwhere you\tlive", ["we know where you live"]));
  assert.ok(matches("Promo-code inside", ["promo code"]));
});

test("matching is whole-word: no hit inside a longer word", () => {
  assert.ok(!matches("the skyscraper was lit", ["kys"]));
  assert.ok(!matches("the kyss collective", ["kys"]));
  assert.ok(!matches("a skilled officer", ["kill"]));
  assert.ok(matches("he typed kys and logged off", ["kys"]));
  assert.ok(matches("(kys)", ["kys"]));
});

test("a trailing * makes the last word a prefix — and only the last word", () => {
  assert.ok(matches("they threatened us", ["threaten*"]));
  assert.ok(matches("threatening letters", ["threaten*"]));
  assert.ok(!matches("unthreatened", ["threaten*"]));
  assert.ok(matches("buy cryptocurrency now", ["buy crypto*"]));
  assert.ok(!matches("buy crypto", ["buy cryptocurrency*"]));
});

test("a term in a script without spaces matches as a substring", () => {
  assert.ok(matches("我要杀了你!", ["杀了你"]));
  const compiled = compileTerm("杀了你");
  assert.equal(compiled?.unbounded, true);
});

test("accented and full-width text matches a plain term", () => {
  assert.ok(matches("Él dijo que era una BROMA — just trolling", ["just trolling"]));
  assert.ok(matches("ｂｕｙ ｃｒｙｐｔｏ today", ["buy crypto"]));
  assert.ok(matches("k​ys", ["kys"]));
});

test("hits record field, rule and term — one per (rule, term, field), in field order", () => {
  const rules = [rule(["handle it ourselves"], "hold", "Threats")];
  const hits = matchKeywords(
    {
      title: "We will handle it ourselves",
      body: "handle it ourselves. Handle it ourselves!",
      locationLabel: "Main St",
    },
    rules,
  );
  assert.equal(hits.length, 2);
  assert.deepEqual(
    hits.map((h) => h.field),
    ["title", "body"],
  );
  assert.equal(hits[0].ruleId, "rule-Threats");
  assert.equal(hits[0].ruleName, "Threats");
  assert.equal(hits[0].action, "hold");
  assert.equal(hits[0].term, "handle it ourselves");
  assert.equal(hits[0].category, "threat");
});

test("terms that fold to nothing never match, and duplicate terms compile once", () => {
  const compiled = compileRule({ id: "r", name: "r", category: "spam", action: "signal", terms: ["!!", "*", "Promo Code", "promo code"] });
  assert.equal(compiled.terms.length, 1);
  assert.equal(matchKeywords({ body: "!! anything *" }, [compiled]).length, 0);
});

test("hits are capped", () => {
  const terms = Array.from({ length: 50 }, (_, i) => `word${i}`);
  const text = terms.join(" ");
  const rules = [rule(terms, "signal", "a"), rule(terms, "signal", "b"), rule(terms, "signal", "c")];
  const hits = matchKeywords({ title: text, body: text }, rules);
  assert.equal(hits.length, MAX_KEYWORD_HITS);
});

test("the seeded Hate Speech rule ships with no terms and disabled", () => {
  const hate = KEYWORD_RULE_SEEDS.find((seed) => seed.category === "hate");
  assert.ok(hate);
  assert.equal(hate.enabled, false);
  assert.equal(hate.terms.length, 0);
});

// ── Term validation (§4.5) ──────────────────────────────────────────────────

test("validateRuleTerms accepts 1–50 terms of 2–80 characters and tidies them", () => {
  const result = validateRuleTerms(["  Promo   Code ", "promo code", "threaten*"]);
  assert.ok(result.ok);
  assert.deepEqual(result.ok && result.terms, ["Promo Code", "threaten*"]);
});

test("validateRuleTerms refuses bad input", () => {
  assert.equal(validateRuleTerms("promo").ok, false);
  assert.equal(validateRuleTerms([]).ok, false);
  assert.equal(validateRuleTerms(["a"]).ok, false);
  assert.equal(validateRuleTerms(["x".repeat(81)]).ok, false);
  assert.equal(validateRuleTerms([42]).ok, false);
  assert.equal(validateRuleTerms(["thr*eat"]).ok, false);
  assert.equal(validateRuleTerms(["threat**"]).ok, false);
  assert.equal(validateRuleTerms(["a*"]).ok, false);
  assert.equal(validateRuleTerms(["!!!"]).ok, false);
  assert.equal(validateRuleTerms(Array.from({ length: 51 }, (_, i) => `term ${i}`)).ok, false);
  assert.equal(validateRuleTerms(Array.from({ length: 50 }, (_, i) => `term ${i}`)).ok, true);
});

// ── Built-in detectors (§4.5) ───────────────────────────────────────────────

function detectors(text: string): string[] {
  return detectContactDetails(text).map((hit) => hit.term);
}

test("detector hits are signals under private_info, with no rule id and no personal data", () => {
  const [hit] = detectContactDetails("write to jane.doe@example.com");
  assert.equal(hit.ruleId, null);
  assert.equal(hit.action, "signal");
  assert.equal(hit.category, "private_info");
  assert.equal(hit.term, "email address");
  assert.ok(!JSON.stringify(hit).includes("jane"));
});

test("email detector", () => {
  assert.deepEqual(detectors("mail me at someone@mail.example.org please"), ["email address"]);
  assert.deepEqual(detectors("see the @handle on twitter"), []);
});

test("phone detector: common formats with nine or more digits", () => {
  assert.deepEqual(detectors("call (555) 123-4567 tonight"), ["phone number"]);
  assert.deepEqual(detectors("whatsapp +44 20 7946 0958"), ["phone number"]);
  assert.deepEqual(detectors("his cell is 555.123.4567"), ["phone number"]);
  assert.deepEqual(detectors("06 12 34 56 78"), ["phone number"]);
  assert.deepEqual(detectors("5551234567"), ["phone number"]);
});

test("phone detector: short numbers, lists, dates and times are not phones", () => {
  assert.deepEqual(detectors("call 911 or 988"), []);
  assert.deepEqual(detectors("patrol car 4471, precinct 73"), []);
  assert.deepEqual(detectors("steps 1 2 3 4 5 6 7 8 9"), []);
  assert.deepEqual(detectors("stopped 2024-05-12 10:30, released 2024-05-12 11:45"), []);
  assert.deepEqual(detectors("on 12.05.2024 1030 they came back"), []);
  assert.deepEqual(detectors("ref 2024-05-12 1030"), []);
});

test("phone detector skip rule: numbers after case|complaint|report|incident|badge|ref|# are references", () => {
  assert.deepEqual(detectors("Complaint number 2024-0045-7781 with the CCRB"), []);
  assert.deepEqual(detectors("case no. 555 123 4567 is still open"), []);
  assert.deepEqual(detectors("Report #20240511-0932 was filed"), []);
  assert.deepEqual(detectors("incident ref: 7781234567"), []);
  assert.deepEqual(detectors("badge 558812901"), []);
  assert.deepEqual(detectors("my complaint ref no. 7781234567 went nowhere"), []);
  assert.deepEqual(detectors("#558812901"), []);
  // …but a report is not a reference context for a phone number further on.
  assert.deepEqual(detectors("I made a report. Call me on 555 123 4567"), ["phone number"]);
  assert.deepEqual(detectors("I reported it, call 555-123-4567"), ["phone number"]);
});

test("SSN detector: written form, never-issued ranges excluded", () => {
  assert.deepEqual(detectors("ssn 123-45-6789"), ["social security number"]);
  assert.deepEqual(detectors("123 45 6789"), ["social security number"]);
  // Never-issued ranges are not SSNs (the digits may still look like a phone).
  for (const text of ["000-12-3456", "666-12-3456", "923-12-3456", "123-00-4567", "123-45-0000"]) {
    assert.ok(!detectors(text).includes("social security number"), text);
  }
  // Mixed separators are not the written SSN form.
  assert.ok(!detectors("123-45 6789").includes("social security number"));
});

test("Luhn: valid card numbers are cards, not phones; invalid ones are not cards", () => {
  assert.equal(luhnValid("4111111111111111"), true);
  assert.equal(luhnValid("4111111111111112"), false);
  assert.equal(luhnValid("0000000000000000"), false);
  assert.equal(luhnValid("123"), false);
  assert.deepEqual(detectors("card 4111 1111 1111 1111 exp 12/27"), ["payment card number"]);
  assert.deepEqual(detectors("5500-0000-0000-0004"), ["payment card number"]);
  assert.deepEqual(detectors("4111 1111 1111 1112"), []);
});

test("several detectors fire once each, in a fixed order", () => {
  assert.deepEqual(
    detectors("jane@example.com, 555-123-4567, 555-987-6543, 4111111111111111, 123-45-6789"),
    ["email address", "social security number", "payment card number", "phone number"],
  );
});

// ── The verbatim-evidence check (D8) ────────────────────────────────────────

test("verbatim: an exact quote is found", () => {
  assert.ok(verbatimInContent("we will find you", ["Title", "Everyone listen: we will find you tonight."]));
});

test("verbatim: case, accents, whitespace, curly quotes and dashes are forgiven", () => {
  const body = "He wrote: “I’ll burn your house — tonight”.";
  assert.ok(verbatimInContent('"i\'ll burn your house - tonight"', [body]));
  assert.ok(verbatimInContent("I'LL   BURN your house", [body]));
  assert.ok(verbatimInContent("…burn your house…", [body]));
  assert.ok(verbatimInContent("él vendrá", ["Dijo que ÉL VENDRÁ por mí"]));
});

test("verbatim: paraphrase, elision and fabricated quotes are not verbatim", () => {
  const body = "The officer said he would come back tomorrow.";
  assert.ok(!verbatimInContent("he will come back tomorrow", [body]));
  assert.ok(!verbatimInContent("the officer said ... tomorrow", [body]));
  assert.ok(!verbatimInContent("I will kill you", [body]));
});

test("verbatim: the quote must sit on word boundaries", () => {
  assert.ok(!verbatimInContent("kill", ["a skilled mechanic"]));
  assert.ok(verbatimInContent("kill", ["I will kill"]));
});

test("verbatim: characters the engine strips before the model reads the content are ignored", () => {
  // The engine's prescreen removes C0 controls (not tab/newline/CR), DEL,
  // zero-width and bidi characters, so the model's quote never has them.
  const body = "They wrote: we will f\u0007ind y​ou‮ tonight";
  assert.ok(verbatimInContent("we will find you tonight", [body]));
  // Removed, not turned into a space: "a\u000bb" reads "ab" to the model.
  assert.ok(verbatimInContent("burn it down", ["we should bu\u000brn it down"]));
});

test("verbatim: empty, trivial or missing evidence never counts", () => {
  assert.ok(!verbatimInContent(null, ["anything"]));
  assert.ok(!verbatimInContent("", ["anything"]));
  assert.ok(!verbatimInContent("  ", ["anything"]));
  assert.ok(!verbatimInContent("a", ["a b c"]));
  assert.ok(!verbatimInContent("!!!", ["!!!"]));
  assert.ok(!verbatimInContent("hello there", [null, undefined, ""]));
});

// ── The golden corpus (§4.5) ────────────────────────────────────────────────

interface CorpusEntry {
  kind: "report" | "comment";
  title?: string;
  body: string;
  locationLabel?: string;
}

/**
 * Realistic content the platform exists for. Several entries deliberately
 * contain the exact phrases the seeded rules look for — as quotes of what was
 * said *to* the author — and several contain phone, complaint, badge and case
 * numbers. None of it may be held on keywords alone.
 */
const GOLDEN_CORPUS: CorpusEntry[] = [
  {
    kind: "report",
    title: "Traffic stop turned into a threat",
    body: "The officer leaned into my window and said 'I will kill you if you move.' I kept both hands on the wheel until his partner told him to calm down.",
    locationLabel: "Flatbush Ave, Brooklyn",
  },
  {
    kind: "report",
    title: "Neighbour threatened my family",
    body: "After the school board meeting, our neighbour followed my son home and told him \"we know where you live\". We have lived here eleven years.",
    locationLabel: "Oak Park",
  },
  {
    kind: "report",
    title: "Protest dispersal",
    body: "Someone at the back of the crowd shouted \"burn it down\" and police charged everyone, including those of us who were only filming from the sidewalk.",
    locationLabel: "City Hall Plaza",
  },
  {
    kind: "report",
    title: "Threat made while my brother was handcuffed",
    body: "While my brother was on the ground in handcuffs, one officer said to the other, \"I'm going to kill him if he spits again.\" He had not spat at anyone.",
  },
  {
    kind: "report",
    title: "Vigilante group in the neighbourhood",
    body: "A group of residents put up flyers saying they would handle it ourselves if the police did not remove the homeless encampment. I am reporting the flyers, not writing them.",
    locationLabel: "Riverside",
  },
  {
    kind: "report",
    title: "Harassment campaign after my post",
    body: "After I posted the video, a local influencer told his followers \"everyone report her\" and my account was locked within an hour.",
  },
  {
    kind: "report",
    title: "Coworker told me to kill myself",
    body: "I complained to HR about the slurs. The next morning my coworker wrote 'kys' in the team chat. HR said it was a joke.",
    locationLabel: "Distribution centre, Route 9",
  },
  {
    kind: "report",
    title: "Group chat shared my husband's address",
    body: "A man in the tenants' group chat wrote 'his home address is on the flyer' about my husband after he spoke at the rent strike meeting.",
  },
  {
    kind: "report",
    title: "Officer named, badge number given",
    body: "Sergeant Daniel Brooks, badge #48213 of the 73rd Precinct, searched my car without consent on Fulton Street and would not give a reason.",
    locationLabel: "Fulton Street",
  },
  {
    kind: "report",
    title: "Complaint still not answered",
    body: "My complaint number is 2024-0045-7781 with the Civilian Complaint Review Board. Case number 2023-CV-004512 is also still open with the Department of Justice.",
  },
  {
    kind: "report",
    title: "Hotline told me to file here",
    body: "I called the legal aid hotline at 1-800-555-0199 and they told me to document everything. Incident report #20240511-0932 was filed at the 5th district.",
  },
  {
    kind: "report",
    title: "Manager used a slur",
    body: "My manager, Karen Hill, called me a monkey in front of the whole shift and laughed. Two coworkers heard it and will confirm.",
    locationLabel: "Downtown store",
  },
  {
    kind: "report",
    title: "Apartment suddenly unavailable",
    body: "The leasing agent said the apartment was taken, but my white friend was shown the same unit an hour later and offered the lease.",
    locationLabel: "Maple Heights",
  },
  {
    kind: "report",
    title: "Denied pain medication",
    body: "The ER nurse refused to give my mother pain medication and said 'you people always exaggerate.' She had a broken wrist.",
  },
  {
    kind: "report",
    title: "Sent home for her hair",
    body: "My daughter Aaliyah, 9, was sent home from PS 305 because of her braids. The principal, Mr. Olsen, said they were a distraction.",
  },
  {
    kind: "report",
    title: "Followed through the store",
    body: "Security followed me through every aisle and then asked to search my bag at the exit. They did not stop anyone else.",
    locationLabel: "Atlantic Ave",
  },
  {
    kind: "report",
    title: "Told to go back to my country",
    body: "Two men yelled 'go back to your country' at my mother and threw a bottle at the bus shelter. The driver called 911.",
  },
  {
    kind: "report",
    title: "Detenido sin motivo",
    body: "El oficial me dijo que me callara y me empujó contra la pared. Número de queja 55-2024-1187. Tengo testigos.",
    locationLabel: "Pilsen, Chicago",
  },
  {
    kind: "report",
    title: "Contrôle au faciès",
    body: "Le contrôleur m'a demandé mes papiers trois fois, seulement à moi, devant tout le wagon.",
  },
  {
    kind: "report",
    title: "Timeline of the stop",
    body: "Stopped at 2024-05-12 10:30, searched until 11:15, released at 2024-05-12 11:45 with no ticket. Patrol car 4471.",
  },
  {
    kind: "report",
    title: "Denied entry to the club",
    body: "The bouncer let my friends in and told me 'not tonight, not your kind of place.' The same thing happened to two other Black men in the line.",
  },
  {
    kind: "comment",
    body: "Same thing happened to me on the Q train last week. Stay strong, and write everything down.",
  },
  {
    kind: "comment",
    body: "Contact the ACLU intake line at 212-549-2500 — they helped my family when this happened to us.",
  },
  {
    kind: "comment",
    body: "My complaint ref no. 7781234567 went nowhere for six months. Keep pushing them.",
  },
  {
    kind: "comment",
    body: "Officer Reyes, badge #558812901, did the exact same thing to my cousin in March.",
  },
  {
    kind: "comment",
    body: "Not a real report? I was standing right there. It happened exactly like this.",
  },
  {
    kind: "comment",
    body: "Email the council at complaints@citycouncil.example.org — they have to respond within 30 days.",
  },
  {
    kind: "comment",
    body: "Thank you for sharing this. If it gets too heavy, you can call or text 988 any time.",
  },
  {
    kind: "comment",
    body: "The man in the video yelled \"I will kill you\" at her. How is he not charged?",
  },
  {
    kind: "comment",
    body: "Stopped 2024-05-12 10:30, released 2024-05-12 11:45 — same precinct, same sergeant.",
  },
  {
    kind: "comment",
    body: "Case number 2023-CV-004512 is the class action. You can join it through the legal aid clinic.",
  },
  {
    kind: "comment",
    body: "He really said 'we know where you live'? That's a threat. Please keep a copy of the message.",
  },
];

function corpusHits(entry: CorpusEntry): KeywordHit[] {
  const hits = matchKeywords(
    entry.kind === "report"
      ? { title: entry.title ?? null, body: entry.body, locationLabel: entry.locationLabel ?? null }
      : { body: entry.body },
    SEEDED_RULES,
  );
  if (entry.kind === "comment") hits.push(...detectContactDetails(entry.body, "body"));
  return hits;
}

test("golden corpus: at least thirty realistic narratives and comments", () => {
  assert.ok(GOLDEN_CORPUS.length >= 30, `corpus has ${GOLDEN_CORPUS.length} entries`);
});

test("golden corpus: the seeded rules and the detectors produce zero `hold` hits", () => {
  for (const entry of GOLDEN_CORPUS) {
    const holds = corpusHits(entry).filter((hit) => hit.action === "hold");
    assert.deepEqual(holds, [], `hold hit on: ${entry.body.slice(0, 60)}`);
  }
});

test("golden corpus: the corpus really does contain quoted threats the seeds signal on", () => {
  // Not vacuous: the seeds fire on the quotes, and the detectors on the
  // hotline number and the email address…
  const signalled = GOLDEN_CORPUS.filter((entry) => corpusHits(entry).some((hit) => hit.action === "signal"));
  assert.ok(signalled.length >= 10, `only ${signalled.length} entries signalled`);
  const terms = new Set(GOLDEN_CORPUS.flatMap((entry) => corpusHits(entry).map((hit) => hit.term)));
  for (const term of ["i will kill you", "we know where you live", "burn it down", "kys", "phone number", "email address"]) {
    assert.ok(terms.has(term), `expected a hit on "${term}"`);
  }
});

test("golden corpus: complaint, case, badge and reference numbers are never phone numbers", () => {
  for (const text of [
    "My complaint ref no. 7781234567 went nowhere for six months.",
    "Officer Reyes, badge #558812901, did the exact same thing.",
    "Case number 2023-CV-004512 is the class action.",
    "Stopped 2024-05-12 10:30, released 2024-05-12 11:45.",
  ]) {
    assert.deepEqual(detectors(text), [], text);
  }
});

test("golden corpus: with the AI assessed and clean, the policy approves every entry", () => {
  for (const entry of GOLDEN_CORPUS) {
    const decision = decide(policyInput(entry.kind, corpusHits(entry)));
    assert.equal(decision.outcome, "approve", `held: ${entry.body.slice(0, 60)} → ${decision.holdReasons.join(",")}`);
    assert.deepEqual(decision.holdReasons, []);
    assert.equal(decision.decidedBy, "ai");
  }
});

test("golden corpus: the same signals *do* hold when the AI could not answer (D9)", () => {
  const entry = GOLDEN_CORPUS[0];
  const input = policyInput("report", corpusHits(entry));
  const decision = decide({ ...input, ai: { status: "unavailable", assessment: null } });
  assert.equal(decision.outcome, "hold");
  assert.ok(decision.holdReasons.includes("keyword_match"));
  assert.ok(decision.holdReasons.includes("ai_unavailable"));
});
