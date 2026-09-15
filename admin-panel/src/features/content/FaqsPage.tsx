/**
 * FAQs.
 *
 * Editing happens in a dialog rather than on its own page: a FAQ is a question
 * and an answer, and sending someone to a full editor for two fields is more
 * navigation than the content deserves.
 */

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
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
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { faqItems as seedFaqs } from "@/mocks/faqItems";
import type { FaqItem } from "@/mocks/types";

const TABS = ["All", "Published", "Draft"] as const;
type FaqTab = (typeof TABS)[number];

const STATUSES = [
  { value: "Draft", label: "Draft — not visible" },
  { value: "Published", label: "Published — live in the app" },
];

/** Today's date in the format the fixtures use. */
function today(): string {
  return new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export function FaqsPage() {
  const toast = useToast();

  const [faqs, setFaqs] = useState<FaqItem[]>(seedFaqs);
  const [tab, setTab] = useState<FaqTab>("All");
  const [category, setCategory] = useState("All");
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [deleting, setDeleting] = useState<FaqItem | null>(null);

  const [draft, setDraft] = useState({
    question: "",
    answer: "",
    category: "",
    status: "Draft",
  });
  const [errors, setErrors] = useState<{ question?: string; answer?: string }>({});

  useEffect(() => {
    document.title = `FAQs · ${env.appName} Admin`;
  }, []);

  const categories = useMemo(
    () => [...new Set(faqs.map((f) => f.category))].sort(),
    [faqs],
  );

  const filters = useMemo(
    () => [
      (f: FaqItem) => tab === "All" || f.status === tab,
      (f: FaqItem) => category === "All" || f.category === category,
    ],
    [tab, category],
  );

  const table = useLocalTable<FaqItem>({
    rows: faqs,
    searchFields: useMemo(
      () => (f: FaqItem) => [f.question, f.answer, f.id, f.category],
      [],
    ),
    filters,
  });

  const openNew = () => {
    setEditing({ id: "", question: "", answer: "", category: categories[0] ?? "General", status: "Draft", updated: "" });
    setDraft({ question: "", answer: "", category: categories[0] ?? "General", status: "Draft" });
    setErrors({});
  };

  const openEdit = (faq: FaqItem) => {
    setEditing(faq);
    setDraft({
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      status: faq.status,
    });
    setErrors({});
  };

  const save = () => {
    const next: typeof errors = {};
    if (draft.question.trim().length < 8) next.question = "Write the question in full.";
    if (draft.answer.trim().length < 20) next.answer = "The answer is too short to help.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    if (editing?.id) {
      setFaqs((current) =>
        current.map((f) =>
          f.id === editing.id
            ? { ...f, ...draft, question: draft.question.trim(), answer: draft.answer.trim(), updated: today() }
            : f,
        ),
      );
      toast.success("FAQ updated", "The answer has been saved.");
    } else {
      setFaqs((current) => [
        {
          id: `FAQ-${Date.now().toString().slice(-4)}`,
          question: draft.question.trim(),
          answer: draft.answer.trim(),
          category: draft.category,
          status: draft.status,
          updated: today(),
        },
        ...current,
      ]);
      toast.success("FAQ created", "The question has been added.");
    }

    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    setFaqs((current) => current.filter((f) => f.id !== deleting.id));
    toast.success("FAQ removed", "The question is no longer shown to members.");
    setDeleting(null);
  };

  const columns: Column<FaqItem>[] = [
    {
      key: "question",
      header: "Question & ID",
      width: "44%",
      render: (faq) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={faq.question}>
              {faq.question}
            </span>
          </div>
          <span className="sub">{faq.id}</span>
        </>
      ),
    },
    { key: "category", header: "Category", width: "18%", render: (f) => f.category },
    {
      key: "updated",
      header: "Last Updated",
      width: "16%",
      render: (f) => <span style={{ fontSize: 12.5 }}>{f.updated}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "12%",
      render: (faq) => (
        <Badge tone={faq.status === "Published" ? "published" : "draft"}>{faq.status}</Badge>
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
        description="Questions members ask most often, with the answers shown in the app."
        actions={
          <Button
            variant="primary"
            className="add-keyword-btn"
            icon={<Icon name="plus" />}
            onClick={openNew}
          >
            New FAQ
          </Button>
        }
      />

      <FixtureNotice module="FAQs" />

      <Tabs
        label="Filter FAQs by status"
        items={TABS.map((value) => ({
          value,
          label: value,
          count: value === "All" ? faqs.length : faqs.filter((f) => f.status === value).length,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search questions and answers…"
          label="Search FAQs"
        />
        <Select
          label="Filter by category"
          value={category}
          options={[
            { value: "All", label: "All Categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          onChange={setCategory}
          minWidth={175}
        />
      </div>

      <DataTable
        caption="Frequently asked questions"
        columns={columns}
        rows={table.pageRows}
        rowKey={(faq) => faq.id}
        minWidth="820px"
        emptyMessage="No FAQs match the selected filters."
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="FAQs"
        />
      ) : null}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit FAQ" : "New FAQ"}
        description="Answer in the member's own terms, not the platform's."
        wide
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing?.id ? "Save Changes" : "Create FAQ"}
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
            value={draft.category}
            options={categories.map((c) => ({ value: c, label: c }))}
            onChange={(value) => setDraft((d) => ({ ...d, category: value }))}
          />
          <Select
            label="Status"
            showLabel
            value={draft.status}
            options={STATUSES}
            onChange={(value) => setDraft((d) => ({ ...d, status: value }))}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete FAQ"
        description={
          deleting
            ? `“${deleting.question}” will be removed from the in-app help.`
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
