/**
 * Keyword Rules — the terms the automated check looks for (plan §4.5, §8.2, D9).
 *
 * Wired to `/admin/moderation/keyword-rules`. A rule is a category, a list of
 * terms and an **action**, and the action is what the table is really about:
 *
 *   hold     — a match always holds the content for a moderator (strict);
 *   signal   — the match is handed to the AI as a hint, and holds only if the AI
 *              confirms that category or cannot answer (the seeds' default —
 *              victims quote threats, and a blunt hold would hold their reports);
 *   monitor  — the match is recorded and counted, nothing more.
 *
 * So the Action column carries its own help text, and the editor spells out the
 * consequence of each choice. The Enabled switch is in the row because turning a
 * noisy rule off is the most common edit and should not take a dialog.
 *
 * Fixes carried over from the port: rows are keyed by rule id (the port keyed by
 * title, so two rules with one name collided), and Add opens a draft instead of
 * inserting a placeholder row that survived Cancel.
 *
 * Reading needs `moderation.view` (implied by the section); every write needs
 * `moderation.keywords`, and the controls say so when it is missing.
 *
 * Column widths (review Q14). The table is fixed-layout with `overflow: hidden`
 * and nowrap headers, so a column narrower than its header or its control is
 * clipped rather than widened. At 1440px (≈1125px of table) Enabled at 6% left
 * ≈35px for a 44px switch and a ≈57px header, and Actions at 7% cut the Delete
 * button off. The columns whose content has a fixed size — Applies To and
 * Detected (bounded by their headers), the switch, the two icon buttons — now
 * have pixel widths; Rule, Category and Action keep percentages; and Terms,
 * the one column that can use any space, takes the rest.
 */

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { useDeniedReason } from "@/components/rbac/Can";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, PageHeader } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import {
  KeywordRuleDialog,
  type KeywordRuleSave,
} from "@/features/moderation/components/KeywordRuleDialog";
import {
  useCreateKeywordRule,
  useDeleteKeywordRule,
  useKeywordRules,
  useUpdateKeywordRule,
} from "@/features/moderation/keywordRules.hooks";
import {
  KEYWORD_ACTIONS,
  KEYWORD_ACTION_HELP,
  KEYWORD_APPLIES_TO_LABELS,
  KEYWORD_KIND_LABELS,
  type KeywordActionFilter,
  type KeywordCategoryFilter,
  type KeywordRule,
} from "@/features/moderation/keywordRules.types";
import { formatDate } from "@/features/moderation/moderation.format";
import {
  KEYWORD_ACTION_LABELS,
  POLICY_CATEGORIES,
  POLICY_CATEGORY_LABELS,
  type KeywordAction,
} from "@/features/moderation/moderation.types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ApiError } from "@/types/api";

const ACTION_FILTER_OPTIONS: { value: KeywordActionFilter; label: string }[] = [
  { value: "all", label: "All Actions" },
  ...KEYWORD_ACTIONS.map((action) => ({
    value: action as KeywordActionFilter,
    label: KEYWORD_ACTION_LABELS[action],
  })),
];

const CATEGORY_FILTER_OPTIONS: { value: KeywordCategoryFilter; label: string }[] = [
  { value: "all", label: "All Categories" },
  ...POLICY_CATEGORIES.map((code) => ({
    value: code as KeywordCategoryFilter,
    label: POLICY_CATEGORY_LABELS[code],
  })),
];

/** Strict reads red, the AI hint reads amber, record-only reads neutral. */
const ACTION_TONES: Record<KeywordAction, BadgeTone> = {
  hold: "rejected",
  signal: "under_review",
  monitor: "draft",
};

/** Chips shown per row before "+n more" — a fifty-term rule would swamp the table. */
const TERM_PREVIEW = 8;

/** Which dialog, if any, is open. */
type DialogState =
  | { kind: "none" }
  | { kind: "form"; rule: KeywordRule | null }
  | { kind: "delete"; rule: KeywordRule };

export function KeywordRulesPage() {
  const toast = useToast();
  const keywordsDenied = useDeniedReason("moderation.keywords");

  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(25);
  const [search, setSearchState] = useState("");
  const [action, setActionState] = useState<KeywordActionFilter>("all");
  const [category, setCategoryState] = useState<KeywordCategoryFilter>("all");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  // Typing should not fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);

  /*
   * Every filter returns to page one, because page 3 of an unfiltered list is
   * rarely page 3 of a filtered one. Done in the setters rather than an effect
   * watching the filters, so the request is made once with the right page.
   */
  const setSearch = (value: string) => {
    setSearchState(value);
    setPage(1);
  };
  const setAction = (value: KeywordActionFilter) => {
    setActionState(value);
    setPage(1);
  };
  const setCategory = (value: KeywordCategoryFilter) => {
    setCategoryState(value);
    setPage(1);
  };
  const setLimit = (value: number) => {
    setLimitState(value);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, limit, search: debouncedSearch, action, category }),
    [page, limit, debouncedSearch, action, category],
  );

  const list = useKeywordRules(params);
  const createRule = useCreateKeywordRule();
  const updateRule = useUpdateKeywordRule();
  // A separate instance for the row switches, so a toggle in flight neither
  // disables the editor's Save nor is mistaken for one.
  const toggleRule = useUpdateKeywordRule();
  const deleteRule = useDeleteKeywordRule();

  useEffect(() => {
    document.title = `Keyword Rules · ${env.appName} Admin`;
  }, []);

  const rows = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  /*
   * Deleting the last rule on the last page (or a colleague deleting rules)
   * can leave `page` past the end: page 2 of what is now one page showed "No
   * keyword rules yet" and "Showing 26 to 25 of 25" (review Q15). Step back to
   * the last real page, as the incident and moderation queues do. Adjusted
   * during render, so the empty page is never painted; skipped while the
   * previous key's data is standing in, whose page count may not describe
   * this request.
   */
  if (pagination && !list.isPlaceholderData) {
    const lastPage = Math.max(1, pagination.totalPages);
    if (page > lastPage) setPage(lastPage);
  }

  /** The row whose switch is mid-request, so only that switch waits. */
  const togglingId = toggleRule.isPending ? (toggleRule.variables?.id ?? null) : null;

  const toggle = (rule: KeywordRule, next: boolean) => {
    // The API refuses to switch on a rule with nothing to match (a disabled
    // seed can have no terms). Say so here instead of round-tripping a 400.
    if (next && rule.terms.length === 0) {
      toast.warning(
        "Add a term first",
        `${rule.name} has no terms yet. Edit it to add some, then switch it on.`,
      );
      return;
    }
    toggleRule.mutate({ id: rule.id, input: { enabled: next } });
  };

  const onSave = async (save: KeywordRuleSave) => {
    try {
      if (save.kind === "create") await createRule.mutateAsync(save.input);
      else await updateRule.mutateAsync({ id: save.id, input: save.input });
      setDialog({ kind: "none" });
    } catch (error) {
      // The hook has already reported it and, on a 404/409, refreshed the list.
      // A 404 means the rule was deleted meanwhile, so every further Save
      // would fail the same way — the editor closes (review Q16). Anything
      // else (a validation 400, a taken name 409) can be fixed in the draft,
      // which stays open.
      if (error instanceof ApiError && error.status === 404) setDialog({ kind: "none" });
    }
  };

  const onConfirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    try {
      await deleteRule.mutateAsync({ id: dialog.rule.id, name: dialog.rule.name });
    } catch {
      // The hook has already reported it; there is nothing to keep open for.
    } finally {
      setDialog({ kind: "none" });
    }
  };

  const columns: Column<KeywordRule>[] = [
    {
      key: "rule",
      header: "Rule",
      width: "17%",
      render: (rule) => (
        <>
          <div
            style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}
            className="cell-truncate"
            title={rule.name}
          >
            {rule.name}
          </div>
          <span className="sub">{KEYWORD_KIND_LABELS[rule.kind]}</span>
        </>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "12%",
      render: (rule) => (
        <span style={{ fontSize: 13 }}>
          {rule.categoryLabel || POLICY_CATEGORY_LABELS[rule.category]}
        </span>
      ),
    },
    {
      key: "terms",
      header: "Terms",
      // No width: Terms takes what the other columns leave (review Q14).
      render: (rule) =>
        rule.terms.length === 0 ? (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>No terms yet</span>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {rule.terms.slice(0, TERM_PREVIEW).map((term) => (
              <span className="keyword-chip" key={term}>
                {term}
              </span>
            ))}
            {rule.terms.length > TERM_PREVIEW ? (
              <span
                className="keyword-chip"
                style={{ color: "var(--muted)" }}
                title={rule.terms.slice(TERM_PREVIEW).join(", ")}
              >
                +{rule.terms.length - TERM_PREVIEW} more
              </span>
            ) : null}
          </div>
        ),
    },
    {
      key: "action",
      header: "Action",
      width: "14%",
      render: (rule) => (
        <>
          <Badge tone={ACTION_TONES[rule.action]}>{KEYWORD_ACTION_LABELS[rule.action]}</Badge>
          <span
            className="sub"
            style={{ whiteSpace: "normal", fontSize: 11.5, lineHeight: 1.35 }}
          >
            {KEYWORD_ACTION_HELP[rule.action]}
          </span>
        </>
      ),
    },
    {
      key: "appliesTo",
      header: "Applies To",
      width: "120px",
      render: (rule) => (
        <span style={{ fontSize: 12.5 }}>{KEYWORD_APPLIES_TO_LABELS[rule.appliesTo]}</span>
      ),
    },
    {
      key: "detected",
      header: "Detected",
      width: "108px",
      render: (rule) => (
        <>
          <span style={{ fontWeight: 600 }}>
            {rule.detectedCount}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}> items</span>
          </span>
          {rule.lastDetectedAt ? (
            <span className="sub" style={{ fontSize: 11 }} title="Last match">
              {formatDate(rule.lastDetectedAt)}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "enabled",
      header: "Enabled",
      width: "100px",
      render: (rule) => (
        <label
          className="switch-toggle"
          title={
            keywordsDenied ?? (rule.enabled ? `Switch off ${rule.name}` : `Switch on ${rule.name}`)
          }
        >
          <input
            type="checkbox"
            checked={rule.enabled}
            disabled={Boolean(keywordsDenied) || togglingId === rule.id}
            aria-label={`${rule.name} is ${rule.enabled ? "on" : "off"}`}
            onChange={(event) => toggle(rule, event.target.checked)}
          />
          <span className="switch-slider" aria-hidden="true" />
        </label>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      // Two 32px buttons and their 6px gap, plus the cell's 18px/4px padding.
      width: "100px",
      align: "right",
      render: (rule) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className={`action-icon-btn${keywordsDenied ? " perm-locked" : ""}`}
            disabled={Boolean(keywordsDenied)}
            title={keywordsDenied ?? `Edit ${rule.name}`}
            aria-label={`Edit ${rule.name}`}
            onClick={() => setDialog({ kind: "form", rule })}
          >
            <Icon name="edit" />
          </button>
          <button
            type="button"
            className={`action-icon-btn delete-icon-btn${keywordsDenied ? " perm-locked" : ""}`}
            disabled={Boolean(keywordsDenied)}
            title={keywordsDenied ?? `Delete ${rule.name}`}
            aria-label={`Delete ${rule.name}`}
            onClick={() => setDialog({ kind: "delete", rule })}
          >
            <Icon name="disable" />
          </button>
        </div>
      ),
    },
  ];

  const filtered = Boolean(debouncedSearch.trim()) || action !== "all" || category !== "all";

  return (
    <>
      <Card>
        <PageHeader
          title="Keyword Rules"
          description="Manage the keyword rules the automated check uses to identify and flag content for review. Changes apply from the next check."
          actions={
            <Button
              variant="primary"
              className="add-keyword-btn"
              icon={<Icon name="plus" />}
              {...(keywordsDenied ? { deniedReason: keywordsDenied } : {})}
              onClick={() => setDialog({ kind: "form", rule: null })}
            >
              Add Rule
            </Button>
          }
        />

        <div
          className="filters"
          style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
        >
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search rules or terms…"
            label="Search keyword rules"
            style={{ flex: 1, maxWidth: 440, minWidth: 260, margin: 0 }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Select
              label="Filter by action"
              value={action}
              options={ACTION_FILTER_OPTIONS}
              onChange={setAction}
              minWidth={150}
            />
            <Select
              label="Filter by category"
              value={category}
              options={CATEGORY_FILTER_OPTIONS}
              onChange={setCategory}
              minWidth={200}
            />
          </div>
        </div>

        <DataTable
          caption="Automated keyword rules"
          columns={columns}
          rows={rows}
          rowKey={(rule) => rule.id}
          minWidth="1100px"
          loading={list.isLoading}
          error={list.isError ? errorMessage(list.error) : null}
          onRetry={() => void list.refetch()}
          skeletonRows={limit > 10 ? 10 : limit}
          emptyMessage={
            debouncedSearch.trim()
              ? `No keyword rules found matching “${debouncedSearch.trim()}”.`
              : filtered
                ? "No keyword rules match the selected filters."
                : "No keyword rules yet. Add one to start flagging content automatically."
          }
        />

        {pagination && pagination.total > 0 ? (
          <Pagination
            page={page}
            pageSize={limit}
            total={pagination.total}
            onPageChange={setPage}
            onPageSizeChange={setLimit}
            itemLabel="rules"
          />
        ) : null}
      </Card>

      <KeywordRuleDialog
        open={dialog.kind === "form"}
        rule={dialog.kind === "form" ? dialog.rule : null}
        busy={createRule.isPending || updateRule.isPending}
        onClose={() => setDialog({ kind: "none" })}
        onSave={(save) => void onSave(save)}
      />

      <ConfirmDialog
        open={dialog.kind === "delete"}
        title="Remove Keyword Rule?"
        description={
          dialog.kind === "delete"
            ? `The filter will stop looking for ${dialog.rule.name}. Content already held for review stays in the queue and still needs a decision. Detection history is kept for audit.`
            : ""
        }
        confirmLabel="Remove Rule"
        destructive
        busy={deleteRule.isPending}
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => setDialog({ kind: "none" })}
      />
    </>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not load the keyword rules.";
}

export default KeywordRulesPage;
