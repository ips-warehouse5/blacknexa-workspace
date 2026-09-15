/**
 * Keyword Rules — the terms that drive automated flagging.
 *
 * Editing a rule changes what the platform flags automatically, so the terms
 * are shown as individual chips rather than one comma-separated string. A
 * moderator can then see and remove a single term without re-typing the list
 * and risking a typo that quietly disables a rule.
 */

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { useDeniedReason } from "@/components/rbac/Can";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput, TextField } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { keywordRules as seedRules } from "@/mocks/keywordRules";
import type { KeywordRule } from "@/mocks/types";

/** Split a stored pattern into its individual terms. */
function toTerms(pattern: string): string[] {
  return pattern
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

type Dialog =
  | { kind: "none" }
  | { kind: "edit"; rule: KeywordRule; index: number }
  | { kind: "delete"; rule: KeywordRule; index: number };

export function KeywordRulesPage() {
  const toast = useToast();
  const canEditDenied = useDeniedReason("moderation.keywords");

  /*
   * Held in component state so edits persist while the screen is open — the
   * prototype behaves the same way. Nothing is written anywhere, and a reload
   * restores the fixture.
   */
  const [rules, setRules] = useState<KeywordRule[]>(seedRules);
  const [dialog, setDialog] = useState<Dialog>({ kind: "none" });
  const [draftTerms, setDraftTerms] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [newTerm, setNewTerm] = useState("");

  useEffect(() => {
    document.title = `Keyword Rules · ${env.appName} Admin`;
  }, []);

  const table = useLocalTable<KeywordRule>({
    rows: rules,
    searchFields: useMemo(
      () => (rule: KeywordRule) => [rule.title, rule.type, rule.source, rule.pattern],
      [],
    ),
  });

  const openEdit = (rule: KeywordRule) => {
    const index = rules.indexOf(rule);
    setDraftTitle(rule.title);
    setDraftTerms(toTerms(rule.pattern));
    setNewTerm("");
    setDialog({ kind: "edit", rule, index });
  };

  const addTerm = () => {
    const term = newTerm.trim();
    if (!term) return;
    // Case-insensitive duplicate check: the matcher does not care about case,
    // so neither should the list.
    if (draftTerms.some((t) => t.toLowerCase() === term.toLowerCase())) {
      setNewTerm("");
      return;
    }
    setDraftTerms((current) => [...current, term]);
    setNewTerm("");
  };

  const saveEdit = () => {
    if (dialog.kind !== "edit") return;
    const { index } = dialog;
    setRules((current) =>
      current.map((rule, i) =>
        i === index
          ? { ...rule, title: draftTitle.trim() || rule.title, pattern: draftTerms.join(", ") }
          : rule,
      ),
    );
    toast.success("Rule updated", `${draftTitle} now matches ${draftTerms.length} terms.`);
    setDialog({ kind: "none" });
  };

  const confirmDelete = () => {
    if (dialog.kind !== "delete") return;
    const { index, rule } = dialog;
    setRules((current) => current.filter((_, i) => i !== index));
    toast.success("Rule removed", `${rule.title} no longer flags content automatically.`);
    setDialog({ kind: "none" });
  };

  const columns: Column<KeywordRule>[] = [
    {
      key: "title",
      header: "Rule",
      width: "26%",
      render: (rule) => (
        <>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
            {rule.title}
          </div>
          <span className="sub">{rule.source}</span>
        </>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "14%",
      render: (rule) => <span className="badge approved">{rule.type}</span>,
    },
    {
      key: "pattern",
      header: "Matched Terms",
      width: "42%",
      render: (rule) => (
        <div className="keywords">
          {toTerms(rule.pattern).map((term) => (
            <span className="keyword-chip" key={term}>
              {term}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "detected",
      header: "Detected",
      width: "9%",
      render: (rule) => (
        <span style={{ fontWeight: 600 }}>
          {rule.detected}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}> items</span>
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "9%",
      align: "right",
      render: (rule) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className={`action-icon-btn${canEditDenied ? " perm-locked" : ""}`}
            disabled={Boolean(canEditDenied)}
            title={canEditDenied ?? `Edit ${rule.title}`}
            aria-label={`Edit ${rule.title}`}
            onClick={() => openEdit(rule)}
          >
            <Icon name="edit" />
          </button>
          <button
            type="button"
            className={`action-icon-btn delete-icon-btn${canEditDenied ? " perm-locked" : ""}`}
            disabled={Boolean(canEditDenied)}
            title={canEditDenied ?? `Delete ${rule.title}`}
            aria-label={`Delete ${rule.title}`}
            onClick={() =>
              setDialog({ kind: "delete", rule, index: rules.indexOf(rule) })
            }
          >
            <Icon name="disable" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card>
      <PageHeader
        title="Keyword Rules"
        description="Terms that flag content for review automatically. Changes take effect on the next scan."
        actions={
          <Button
            variant="primary"
            className="add-keyword-btn"
            icon={<Icon name="plus" />}
            {...(canEditDenied ? { deniedReason: canEditDenied } : {})}
            onClick={() => {
              const rule: KeywordRule = {
                title: "New rule",
                type: "System Policy",
                source: "Admin Defined",
                pattern: "",
                detected: 0,
              };
              setRules((current) => [rule, ...current]);
              setDraftTitle(rule.title);
              setDraftTerms([]);
              setNewTerm("");
              setDialog({ kind: "edit", rule, index: 0 });
            }}
          >
            Add Rule
          </Button>
        }
      />

      <FixtureNotice module="Keyword rules" />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search rules or terms…"
          label="Search keyword rules"
        />
      </div>

      <DataTable
        caption="Automated keyword rules"
        columns={columns}
        rows={table.pageRows}
        rowKey={(rule) => rule.title}
        minWidth="900px"
        emptyMessage="No keyword rules match your search."
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="rules"
        />
      ) : null}

      <Modal
        open={dialog.kind === "edit"}
        onClose={() => setDialog({ kind: "none" })}
        title="Edit Keyword Rule"
        description="Content matching any of these terms is flagged for review."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog({ kind: "none" })}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveEdit}>
              Save Rule
            </Button>
          </>
        }
      >
        <TextField
          label="Rule name"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
        />

        <label htmlFor="keyword-new-term">Matched terms</label>
        <div className="keyword-editor">
          {draftTerms.map((term) => (
            <span className="keyword-chip editable" key={term}>
              {term}
              <button
                type="button"
                className="delete-keyword"
                aria-label={`Remove ${term}`}
                onClick={() => setDraftTerms((c) => c.filter((t) => t !== term))}
              >
                ×
              </button>
            </span>
          ))}
          {draftTerms.length === 0 ? (
            <span style={{ color: "var(--muted)", fontSize: 12 }}>No terms yet.</span>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            id="keyword-new-term"
            type="text"
            value={newTerm}
            placeholder="Add a term and press Enter"
            style={{ flex: 1 }}
            onChange={(e) => setNewTerm(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds the term rather than submitting — inside a modal,
              // a stray submit would close the dialog and lose the rest.
              if (e.key === "Enter") {
                e.preventDefault();
                addTerm();
              }
            }}
          />
          <Button variant="outline" onClick={addTerm}>
            Add
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={dialog.kind === "delete"}
        title="Delete Keyword Rule"
        description={
          dialog.kind === "delete"
            ? `“${dialog.rule.title}” will stop flagging content automatically. Items it already flagged stay in the queue.`
            : ""
        }
        confirmLabel="Delete Rule"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDialog({ kind: "none" })}
      />
    </Card>
  );
}

export default KeywordRulesPage;
