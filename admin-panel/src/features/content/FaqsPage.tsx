/**
 * FAQs.
 *
 * Editing happens in a dialog rather than on its own page: a FAQ is a question
 * and an answer, and sending someone to a full editor for two fields is more
 * navigation than the content deserves.
 *
 * Wired to `/api/v1/admin/faqs`. This screen used to edit a local array of
 * design fixtures that existed nowhere else — the changes an operator made
 * survived until they navigated away. It now writes to the same table the
 * mobile Help screen and the marketing site read, which is what makes the
 * "Surfaces" control below meaningful: an entry is published to the app, the
 * website, both, or neither.
 *
 * Paging, search and the status filter are server-side, so the table is one
 * page of a list that can grow rather than a filtered copy of everything.
 */

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput, TextField } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import {
  useCreateFaq,
  useDeleteFaq,
  useFaqCategories,
  useFaqList,
  useFaqSummary,
  useUpdateFaq,
} from "@/features/content/faq/faq.hooks";
import {
  FAQ_STATUS_LABELS,
  FAQ_STATUS_TONES,
  FAQ_SURFACES,
  FAQ_SURFACE_LABELS,
  type CreateFaqInput,
  type Faq,
  type FaqStatus,
  type FaqSurface,
} from "@/features/content/faq/faq.types";

const TABS = ["All", "Published", "Draft"] as const;
type FaqTab = (typeof TABS)[number];

/** Tab label → the status the API filters on. */
const TAB_STATUS: Record<FaqTab, FaqStatus | "all"> = {
  All: "all",
  Published: "published",
  Draft: "draft",
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft — not visible" },
  { value: "published", label: "Published — live on the selected surfaces" },
];

/** What a new entry starts as. Draft, so nothing goes live by being saved. */
const EMPTY_DRAFT: CreateFaqInput = {
  question: "",
  answer: "",
  categoryId: "",
  status: "draft",
  surfaces: ["app", "website"],
  startHere: false,
};

/** "18 Sep 2026" — the console's own formatting, from the API's ISO string. */
function formatUpdated(iso: string): string {
  const value = Date.parse(iso);
  if (!Number.isFinite(value)) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function FaqsPage() {
  const [tab, setTab] = useState<FaqTab>("All");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [editing, setEditing] = useState<Faq | "new" | null>(null);
  const [deleting, setDeleting] = useState<Faq | null>(null);
  const [draft, setDraft] = useState<CreateFaqInput>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<{ question?: string; answer?: string; categoryId?: string }>(
    {},
  );

  useEffect(() => {
    document.title = `FAQs · ${env.appName} Admin`;
  }, []);

  const params = useMemo(
    () => ({ page, limit: pageSize, search, status: TAB_STATUS[tab], categoryId }),
    [page, pageSize, search, tab, categoryId],
  );

  const list = useFaqList(params);
  const summary = useFaqSummary();
  const categories = useFaqCategories();

  const createFaq = useCreateFaq();
  const updateFaq = useUpdateFaq();
  const deleteFaq = useDeleteFaq();

  const rows = list.data?.items ?? [];
  const pagination = list.data?.pagination;
  const categoryOptions = categories.data ?? [];
  const saving = createFaq.isPending || updateFaq.isPending;

  /*
   * Every filter change returns to page one.
   *
   * Done in the handlers rather than an effect watching the filter state: an
   * effect that calls `setPage` reacts to a render it could have prevented,
   * which costs a second render pass and, briefly, a request for a page that
   * does not exist under the new filter. Resetting where the change originates
   * keeps it to one render.
   */
  const changeTab = (next: FaqTab) => {
    setTab(next);
    setPage(1);
  };

  const changeCategory = (next: string) => {
    setCategoryId(next);
    setPage(1);
  };

  const changeSearch = (next: string) => {
    setSearch(next);
    setPage(1);
  };

  const openNew = () => {
    setDraft({ ...EMPTY_DRAFT, categoryId: categoryOptions[0]?.id ?? "" });
    setErrors({});
    setEditing("new");
  };

  const openEdit = (faq: Faq) => {
    setDraft({
      question: faq.question,
      answer: faq.answer,
      categoryId: faq.categoryId,
      status: faq.status,
      surfaces: faq.surfaces,
      startHere: faq.startHere,
    });
    setErrors({});
    setEditing(faq);
  };

  /** Toggle one surface without disturbing the other. */
  const toggleSurface = (surface: FaqSurface) => {
    setDraft((current) => ({
      ...current,
      surfaces: current.surfaces.includes(surface)
        ? current.surfaces.filter((value) => value !== surface)
        : [...current.surfaces, surface],
    }));
  };

  const save = () => {
    const next: typeof errors = {};
    if (draft.question.trim().length < 8) next.question = "Write the question in full.";
    if (draft.answer.trim().length < 20) next.answer = "The answer is too short to help.";
    if (!draft.categoryId) next.categoryId = "Choose a category.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const input: CreateFaqInput = {
      ...draft,
      question: draft.question.trim(),
      answer: draft.answer.trim(),
    };

    const done = () => setEditing(null);
    if (editing && editing !== "new") {
      updateFaq.mutate({ id: editing.id, input }, { onSuccess: done });
    } else {
      createFaq.mutate(input, { onSuccess: done });
    }
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteFaq.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
  };

  const columns: Column<Faq>[] = [
    {
      key: "question",
      header: "Question",
      width: "40%",
      render: (faq) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={faq.question}>
              {faq.question}
            </span>
          </div>
          <span className="sub">{faq.categoryLabel}</span>
        </>
      ),
    },
    {
      key: "surfaces",
      header: "Shown on",
      width: "18%",
      render: (faq) =>
        faq.surfaces.length === 0 ? (
          // Worth naming rather than leaving blank: a published entry on no
          // surface is invisible, and that looks like a bug from the table.
          <span className="sub">Nowhere</span>
        ) : (
          <span style={{ fontSize: 12.5 }}>
            {faq.surfaces.map((surface) => FAQ_SURFACE_LABELS[surface]).join(" · ")}
          </span>
        ),
    },
    {
      key: "updatedAt",
      header: "Last Updated",
      width: "14%",
      render: (faq) => <span style={{ fontSize: 12.5 }}>{formatUpdated(faq.updatedAt)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "12%",
      render: (faq) => (
        <Badge tone={FAQ_STATUS_TONES[faq.status]}>{FAQ_STATUS_LABELS[faq.status]}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "10%",
      align: "right",
      render: (faq) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="action-icon-btn"
            aria-label={`Edit: ${faq.question}`}
            title="Edit"
            onClick={() => openEdit(faq)}
          >
            <Icon name="edit" />
          </button>
          <button
            type="button"
            className="action-icon-btn delete-icon-btn"
            aria-label={`Delete: ${faq.question}`}
            title="Delete"
            onClick={() => setDeleting(faq)}
          >
            <Icon name="disable" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card className="cm-page">
      <PageHeader
        title="FAQs"
        description="Answers shown in the app's Help screen and on the website. Each entry names which."
        actions={
          <Button
            variant="primary"
            className="add-keyword-btn"
            icon={<Icon name="plus" />}
            onClick={openNew}
            disabled={categoryOptions.length === 0}
          >
            New FAQ
          </Button>
        }
      />

      <Tabs
        label="Filter FAQs by status"
        items={TABS.map((value) => {
          const count =
            value === "All"
              ? summary.data?.total
              : value === "Published"
                ? summary.data?.published
                : summary.data?.draft;
          // `count` is omitted rather than passed as undefined: the project
          // compiles with `exactOptionalPropertyTypes`, so an explicit
          // undefined is not the same as an absent optional prop. Before the
          // summary loads there is genuinely no count to show.
          return { value, label: value, ...(count === undefined ? {} : { count }) };
        })}
        value={tab}
        onChange={changeTab}
      />

      <div className="filters">
        <SearchInput
          value={search}
          onChange={changeSearch}
          placeholder="Search questions and answers…"
          label="Search FAQs"
        />
        <Select
          label="Filter by category"
          value={categoryId}
          options={[
            { value: "all", label: "All Categories" },
            ...categoryOptions.map((category) => ({
              value: category.id,
              label: category.label,
            })),
          ]}
          onChange={changeCategory}
          minWidth={175}
        />
      </div>

      <DataTable
        caption="Frequently asked questions"
        columns={columns}
        rows={rows}
        rowKey={(faq) => faq.id}
        minWidth="820px"
        loading={list.isLoading}
        emptyMessage={
          list.isError
            ? "The FAQ list could not be loaded."
            : "No FAQs match the selected filters."
        }
      />

      {pagination && pagination.total > 0 ? (
        <Pagination
          page={pagination.page}
          pageSize={pagination.limit}
          total={pagination.total}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          itemLabel="FAQs"
        />
      ) : null}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && editing !== "new" ? "Edit FAQ" : "New FAQ"}
        description="Answer in the member's own terms, not the platform's."
        wide
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving
                ? "Saving…"
                : editing && editing !== "new"
                  ? "Save Changes"
                  : "Create FAQ"}
            </Button>
          </>
        }
      >
        <TextField
          label="Question"
          value={draft.question}
          error={errors.question}
          placeholder="e.g. Can I report something anonymously?"
          onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
        />

        <label htmlFor="faq-answer">Answer</label>
        <textarea
          id="faq-answer"
          rows={6}
          value={draft.answer}
          placeholder="Answer plainly, in a few sentences."
          {...(errors.answer ? { "aria-invalid": true } : {})}
          onChange={(e) => setDraft((d) => ({ ...d, answer: e.target.value }))}
        />
        {errors.answer ? (
          <div className="field-error-msg" style={{ display: "block" }}>
            {errors.answer}
          </div>
        ) : null}

        <div className="form-row-2" style={{ marginTop: 14 }}>
          <Select
            label="Category"
            showLabel
            value={draft.categoryId}
            options={categoryOptions.map((category) => ({
              value: category.id,
              label: category.label,
            }))}
            onChange={(value) => setDraft((d) => ({ ...d, categoryId: value }))}
          />
          <Select
            label="Status"
            showLabel
            value={draft.status}
            options={STATUS_OPTIONS}
            onChange={(value) => setDraft((d) => ({ ...d, status: value as FaqStatus }))}
          />
        </div>

        <fieldset style={{ marginTop: 16, border: 0, padding: 0 }}>
          <legend style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
            Shown on
          </legend>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {FAQ_SURFACES.map((surface) => (
              <label
                key={surface}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13.5 }}
              >
                <input
                  type="checkbox"
                  checked={draft.surfaces.includes(surface)}
                  onChange={() => toggleSurface(surface)}
                />
                {FAQ_SURFACE_LABELS[surface]}
              </label>
            ))}
          </div>
          {draft.surfaces.length === 0 ? (
            // Not an error — an entry parked on no surface is a legitimate way
            // to retire an answer without deleting it. Worth stating, though,
            // because publishing it would otherwise appear to do nothing.
            <div className="sub" style={{ marginTop: 8 }}>
              This entry will not appear anywhere, even if published.
            </div>
          ) : null}

          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 13.5,
              marginTop: 14,
            }}
          >
            <input
              type="checkbox"
              checked={draft.startHere}
              onChange={() => setDraft((d) => ({ ...d, startHere: !d.startHere }))}
            />
            Show in the app&rsquo;s &ldquo;Start here&rdquo; set
          </label>
        </fieldset>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete FAQ"
        description={
          deleting
            ? `“${deleting.question}” will be removed from the app and the website.`
            : ""
        }
        confirmLabel="Delete FAQ"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

export default FaqsPage;
