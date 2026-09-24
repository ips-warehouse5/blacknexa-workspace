/**
 * Add or edit a keyword rule (plan §4.5, D9).
 *
 * One dialog for both, because the fields are the same and keeping them
 * together means the validation cannot drift. Two differences from the port it
 * replaces, both bugs there:
 *
 *   • **Nothing is written until Save.** The port inserted a "New rule" row the
 *     moment Add was clicked and left it behind on Cancel. Here the dialog holds
 *     a draft; Cancel discards it and the table never sees it.
 *   • **Edits send only what changed.** PATCH takes any subset, so a rename does
 *     not resend fifty terms, and an untouched seed with no terms can be renamed
 *     without tripping the "at least one term" rule.
 *
 * Terms are chips, not a comma-separated string, so one term can be removed
 * without retyping the rest (and a typo cannot quietly break the whole list).
 * Each chip is checked as it is added against the server's rules — 2–80
 * characters, a `*` only at the end as a prefix marker, at least one letter or
 * digit — and duplicates are folded the way the matcher folds them. Commas in
 * the box add several terms at once, for pasting a list.
 *
 * The action is chosen with its consequence spelled out, because the choice is
 * the whole of D9: *signal* is the safe default for phrases victims quote.
 */

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Switch, TextField } from "@/components/ui/Fields";
import { Modal } from "@/components/ui/Modal";
import { Select, type SelectOption } from "@/components/ui/Select";
import {
  KEYWORD_ACTIONS,
  KEYWORD_ACTION_HELP,
  KEYWORD_APPLIES_TO,
  KEYWORD_APPLIES_TO_LABELS,
  RULE_NAME_LIMITS,
  TERM_LIMITS,
  normaliseTerm,
  termKey,
  termProblem,
  type CreateKeywordRuleInput,
  type KeywordAppliesTo,
  type KeywordRule,
  type UpdateKeywordRuleInput,
} from "@/features/moderation/keywordRules.types";
import {
  KEYWORD_ACTION_LABELS,
  POLICY_CATEGORIES,
  POLICY_CATEGORY_LABELS,
  type KeywordAction,
  type PolicyCategory,
} from "@/features/moderation/moderation.types";

const CATEGORY_OPTIONS: SelectOption<PolicyCategory>[] = POLICY_CATEGORIES.map((code) => ({
  value: code,
  label: POLICY_CATEGORY_LABELS[code],
}));

const ACTION_OPTIONS: SelectOption<KeywordAction>[] = KEYWORD_ACTIONS.map((action) => ({
  value: action,
  label: KEYWORD_ACTION_LABELS[action],
  hint: KEYWORD_ACTION_HELP[action],
}));

const APPLIES_TO_OPTIONS: SelectOption<KeywordAppliesTo>[] = KEYWORD_APPLIES_TO.map((value) => ({
  value,
  label: KEYWORD_APPLIES_TO_LABELS[value],
}));

export type KeywordRuleSave =
  | { kind: "create"; input: CreateKeywordRuleInput }
  | { kind: "update"; id: string; input: UpdateKeywordRuleInput };

export interface KeywordRuleDialogProps {
  open: boolean;
  /** The rule being edited, or null to add one. */
  rule: KeywordRule | null;
  busy: boolean;
  onClose: () => void;
  onSave: (save: KeywordRuleSave) => void;
}

function sameTerms(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((term, index) => term === b[index]);
}

function RuleForm({ open, rule, busy, onClose, onSave }: KeywordRuleDialogProps) {
  const editing = rule !== null;

  // Seeded once per opening — the wrapper remounts per rule — and never
  // re-seeded from props, so a background refetch cannot overwrite a draft.
  const [name, setName] = useState(rule?.name ?? "");
  const [category, setCategory] = useState<PolicyCategory>(rule?.category ?? "threat");
  const [terms, setTerms] = useState<string[]>(rule?.terms ?? []);
  const [action, setAction] = useState<KeywordAction>(rule?.action ?? "signal");
  const [appliesTo, setAppliesTo] = useState<KeywordAppliesTo>(rule?.appliesTo ?? "all");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [newTerm, setNewTerm] = useState("");
  const [termError, setTermError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const nameError =
    trimmedName.length > 0 && trimmedName.length < RULE_NAME_LIMITS.min
      ? `A rule name needs at least ${RULE_NAME_LIMITS.min} characters.`
      : undefined;

  const termsChanged = !sameTerms(terms, rule?.terms ?? []);
  // Creating always needs a term (the API requires 1–50). Editing needs one
  // only when the list is being replaced, or the rule is being switched on.
  const termsMissing =
    terms.length === 0 && (!editing || termsChanged || (enabled && !(rule?.enabled ?? false)));

  const changes: UpdateKeywordRuleInput = {};
  if (rule) {
    if (trimmedName !== rule.name) changes.name = trimmedName;
    if (category !== rule.category) changes.category = category;
    if (termsChanged) changes.terms = terms;
    if (action !== rule.action) changes.action = action;
    if (appliesTo !== rule.appliesTo) changes.appliesTo = appliesTo;
    if (enabled !== rule.enabled) changes.enabled = enabled;
  }
  const dirty = !editing || Object.keys(changes).length > 0;

  const valid =
    trimmedName.length >= RULE_NAME_LIMITS.min &&
    trimmedName.length <= RULE_NAME_LIMITS.max &&
    !termsMissing &&
    terms.length <= TERM_LIMITS.maxTerms;

  /** Add whatever is in the box — one term, or several separated by commas. */
  const addTerms = () => {
    const candidates = newTerm
      .split(",")
      .map(normaliseTerm)
      .filter(Boolean);
    if (candidates.length === 0) return;

    const next = [...terms];
    const seen = new Set(next.map(termKey));
    for (const candidate of candidates) {
      const problem = termProblem(candidate);
      if (problem) {
        // Keep the offending text in the box so it can be fixed, not retyped.
        setTermError(`${problem} (“${candidate}”)`);
        setTerms(next);
        setNewTerm(candidate);
        return;
      }
      // The matcher ignores case and accents, so the list does too.
      if (seen.has(termKey(candidate))) continue;
      if (next.length >= TERM_LIMITS.maxTerms) {
        setTermError(`A rule can have at most ${TERM_LIMITS.maxTerms} terms.`);
        setTerms(next);
        setNewTerm("");
        return;
      }
      seen.add(termKey(candidate));
      next.push(candidate);
    }
    setTerms(next);
    setNewTerm("");
    setTermError(null);
  };

  const save = () => {
    if (!valid || !dirty) return;
    if (rule) {
      onSave({ kind: "update", id: rule.id, input: changes });
    } else {
      onSave({
        kind: "create",
        input: { name: trimmedName, category, terms, action, appliesTo, enabled },
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      wide
      title={editing ? "Edit Keyword Rule" : "Add Keyword Rule"}
      description="Content is checked against these terms on every automated check. What a match does depends on the action."
      // A half-built term list should not be lost to a stray click.
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!valid || !dirty}>
            {editing ? "Save Rule" : "Add Rule"}
          </Button>
        </>
      }
    >
      <TextField
        label="Rule name"
        value={name}
        maxLength={RULE_NAME_LIMITS.max}
        placeholder="e.g. Retaliation threats"
        error={nameError}
        disabled={busy}
        onChange={(event) => setName(event.target.value)}
      />

      <div className="form-row-2" style={{ marginTop: 4 }}>
        <Select<PolicyCategory>
          label="Category"
          showLabel
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={setCategory}
          disabled={busy}
        />
        <Select<KeywordAppliesTo>
          label="Applies to"
          showLabel
          value={appliesTo}
          options={APPLIES_TO_OPTIONS}
          onChange={setAppliesTo}
          disabled={busy}
        />
      </div>

      <label htmlFor="keyword-new-term">
        Matched terms ({terms.length} / {TERM_LIMITS.maxTerms})
      </label>
      <div className="keyword-editor">
        {terms.map((term) => (
          <span className="keyword-chip editable" key={term}>
            {term}
            <button
              type="button"
              className="delete-keyword"
              aria-label={`Remove ${term}`}
              disabled={busy}
              onClick={() => setTerms((current) => current.filter((t) => t !== term))}
            >
              ×
            </button>
          </span>
        ))}
        {terms.length === 0 ? (
          <span style={{ color: "var(--muted)", fontSize: 12 }}>No terms yet.</span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input
          id="keyword-new-term"
          type="text"
          value={newTerm}
          maxLength={TERM_LIMITS.maxChars * 10}
          placeholder="Add a term and press Enter — commas add several"
          style={{ flex: 1 }}
          disabled={busy}
          {...(termError ? { "aria-invalid": true, "aria-describedby": "keyword-term-error" } : {})}
          onChange={(event) => {
            setNewTerm(event.target.value);
            if (termError) setTermError(null);
          }}
          onKeyDown={(event) => {
            // Enter adds the term rather than submitting — inside a modal, a
            // stray submit would close the dialog and lose the rest.
            if (event.key === "Enter") {
              event.preventDefault();
              addTerms();
            }
          }}
        />
        <Button variant="outline" onClick={addTerms} disabled={busy || !newTerm.trim()}>
          Add
        </Button>
      </div>
      {termError ? (
        <div className="field-error-msg" id="keyword-term-error">
          {termError}
        </div>
      ) : termsMissing ? (
        <div className="field-error-msg">
          {editing && !termsChanged
            ? "Add at least one term before switching this rule on."
            : "Add at least one term."}
        </div>
      ) : (
        <div className="field-hint">
          Whole words and phrases, 2–{TERM_LIMITS.maxChars} characters. End a term with * to match
          every word that starts with it (for example promo*). Case and accents are ignored.
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Select<KeywordAction>
          label="Action"
          showLabel
          value={action}
          options={ACTION_OPTIONS}
          onChange={setAction}
          disabled={busy}
        />
        <div className="field-hint">{KEYWORD_ACTION_HELP[action]}</div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Switch
          checked={enabled}
          onChange={setEnabled}
          disabled={busy}
          label="Rule is on"
          hint="A rule that is off keeps its detection history but matches nothing."
        />
      </div>
    </Modal>
  );
}

/**
 * Remounts per rule.
 *
 * Opening one rule and then another must not show the first one's terms still
 * in the editor. Keying on the id (or "new") gives that for free, which an
 * effect that re-seeds on open only approximates.
 */
export function KeywordRuleDialog(props: KeywordRuleDialogProps) {
  if (!props.open) return null;
  return <RuleForm key={props.rule?.id ?? "new"} {...props} />;
}

export default KeywordRuleDialog;
