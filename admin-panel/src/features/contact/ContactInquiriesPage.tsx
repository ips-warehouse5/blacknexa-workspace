/**
 * Contact Us — the enquiry queue.
 *
 * Messages sent from the marketing site's contact form, newest first. The
 * screen is built to be worked rather than browsed: a row opens the message in
 * place, and the status and the internal note are set from there, so triaging
 * an enquiry never costs a page load.
 *
 * Reading and acting are separate permissions. `contact.view` opens the screen;
 * `contact.manage` is what turns the status control on, and Advocates — who
 * hold neither — do not see the section at all.
 */

import { useEffect, useMemo, useState } from "react";

import { Can, useDeniedReason, usePermission } from "@/components/rbac/Can";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, KpiCard, KpiGrid, PageHeader } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { InquiryDetailDialog } from "@/features/contact/components/InquiryDetailDialog";
import {
  useContactList,
  useContactSummary,
  useDeleteContactInquiry,
  useUpdateContactInquiry,
} from "@/features/contact/contact.hooks";
import {
  CONTACT_STATUSES,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_TONES,
  CONTACT_SUBJECTS,
  CONTACT_SUBJECT_LABELS,
  type ContactInquiry,
  type ContactStatusFilter,
  type ContactSubjectFilter,
  type UpdateContactInput,
} from "@/features/contact/contact.types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ApiError } from "@/types/api";

const STATUS_FILTER_OPTIONS: { value: ContactStatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  ...CONTACT_STATUSES.map((s) => ({
    value: s as ContactStatusFilter,
    label: CONTACT_STATUS_LABELS[s],
  })),
];

const SUBJECT_FILTER_OPTIONS: { value: ContactSubjectFilter; label: string }[] = [
  { value: "all", label: "All Subjects" },
  ...CONTACT_SUBJECTS.map((s) => ({
    value: s as ContactSubjectFilter,
    label: CONTACT_SUBJECT_LABELS[s],
  })),
];

/** The tiles, in the order an enquiry moves through them. */
const KPI_TILES = [
  { status: "new" as const, label: "New" },
  { status: "in_progress" as const, label: "In Progress" },
  { status: "resolved" as const, label: "Resolved" },
];

/** Which dialog, if any, is open. One value beats two booleans that can lie. */
type DialogState =
  | { kind: "none" }
  | { kind: "detail"; inquiry: ContactInquiry }
  | { kind: "delete"; inquiry: ContactInquiry };

export function ContactInquiriesPage() {
  const canManage = usePermission("contact.manage");
  const manageDenied = useDeniedReason("contact.manage");

  const [page, setPage] = useState(1);
  const [limit, setLimitState] = useState(10);
  const [search, setSearchState] = useState("");
  const [status, setStatusState] = useState<ContactStatusFilter>("all");
  const [subject, setSubjectState] = useState<ContactSubjectFilter>("all");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });

  // Typing should not fire a request per keystroke.
  const debouncedSearch = useDebouncedValue(search, 300);

  /*
   * Every filter returns to page one, because page 7 of an unfiltered queue is
   * rarely page 7 of a filtered one. Done in the setters rather than an effect
   * watching the filters, so the request is made once with the right page
   * instead of once with the stale one and again after a correcting render.
   */
  const setSearch = (value: string) => {
    setSearchState(value);
    setPage(1);
  };
  const setStatus = (value: ContactStatusFilter) => {
    setStatusState(value);
    setPage(1);
  };
  const setSubject = (value: ContactSubjectFilter) => {
    setSubjectState(value);
    setPage(1);
  };
  const setLimit = (value: number) => {
    setLimitState(value);
    setPage(1);
  };

  const params = useMemo(
    () => ({ page, limit, search: debouncedSearch, status, subject }),
    [page, limit, debouncedSearch, status, subject],
  );

  const list = useContactList(params);
  const summary = useContactSummary();
  const updateInquiry = useUpdateContactInquiry();
  const deleteInquiry = useDeleteContactInquiry();

  useEffect(() => {
    document.title = `Contact Us · ${env.appName} Admin`;
  }, []);

  const rows = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  /*
   * Keep the open dialog in step with the list.
   *
   * Saving a status refetches the page, and the dialog is holding the row
   * object from *before* that write. Without this it would go on showing the
   * old status until it was closed and reopened, which reads as a save that
   * did not take.
   */
  const openInquiry =
    dialog.kind === "detail"
      ? (rows.find((row) => row.id === dialog.inquiry.id) ?? dialog.inquiry)
      : null;

  const columns: Column<ContactInquiry>[] = [
    {
      key: "sender",
      header: "From",
      width: "24%",
      cellClassName: "cell-truncate",
      render: (inquiry) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
            {inquiry.name}
          </div>
          <div className="sub" style={{ fontSize: 11, color: "var(--muted)" }}>
            {inquiry.email}
          </div>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Subject",
      width: "15%",
      render: (inquiry) => (
        <span style={{ fontSize: 13, color: "var(--text)" }}>{inquiry.subjectLabel}</span>
      ),
    },
    {
      key: "message",
      header: "Message",
      width: "27%",
      cellClassName: "cell-truncate",
      render: (inquiry) => (
        // A preview only — the full text, line breaks and all, is in the dialog.
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{preview(inquiry.message)}</span>
      ),
    },
    {
      key: "received",
      header: "Received",
      width: "13%",
      render: (inquiry) => (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {formatDateTime(inquiry.submittedAt)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "11%",
      render: (inquiry) => (
        <Badge tone={CONTACT_STATUS_TONES[inquiry.status]}>
          {CONTACT_STATUS_LABELS[inquiry.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "10%",
      align: "right",
      render: (inquiry) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="action-icon-btn"
            title={`Open the enquiry from ${inquiry.name}`}
            aria-label={`Open the enquiry from ${inquiry.name}`}
            onClick={(e) => {
              // The row itself opens the dialog too; without this the click
              // would also reach the row handler and fire twice.
              e.stopPropagation();
              setDialog({ kind: "detail", inquiry });
            }}
          >
            <Icon name="message" />
          </button>

          <Can perform="contact.delete">
            <button
              type="button"
              className="action-icon-btn delete-icon-btn"
              title={`Remove the enquiry from ${inquiry.name}`}
              aria-label={`Remove the enquiry from ${inquiry.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setDialog({ kind: "delete", inquiry });
              }}
            >
              <Icon name="close" />
            </button>
          </Can>
        </div>
      ),
    },
  ];

  const onSave = async (input: UpdateContactInput) => {
    if (dialog.kind !== "detail") return;
    try {
      await updateInquiry.mutateAsync({ id: dialog.inquiry.id, input });
      setDialog({ kind: "none" });
    } catch {
      // The hook has already reported it; the dialog stays open so the note
      // being written is not thrown away by a failed request.
    }
  };

  const onConfirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    try {
      await deleteInquiry.mutateAsync(dialog.inquiry.id);
    } finally {
      setDialog({ kind: "none" });
    }
  };

  return (
    <>
      <Card>
        <PageHeader
          title="Contact Us Inquiries"
          description="Messages sent through the contact form on blacknexa.org. Reply by email, then set a status so the rest of the team knows where it stands."
        />

        <KpiGrid columns={4} style={{ marginBottom: 20 }}>
          {KPI_TILES.map((tile) => (
            <KpiCard
              key={tile.status}
              compact
              label={tile.label}
              tag={
                <Badge tone={CONTACT_STATUS_TONES[tile.status]}>
                  {CONTACT_STATUS_LABELS[tile.status]}
                </Badge>
              }
              value={summary.isLoading ? "—" : (summary.data?.[tile.status] ?? 0)}
            />
          ))}
          <KpiCard
            compact
            label="Total Received"
            value={summary.isLoading ? "—" : (summary.data?.total ?? 0)}
            footer="All time, archived included"
          />
        </KpiGrid>

        <div
          className="filters"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email or message…"
            label="Search inquiries"
            style={{ flex: 1, maxWidth: 440, minWidth: 260, margin: 0 }}
          />

          <Select
            label="Filter by status"
            value={status}
            options={STATUS_FILTER_OPTIONS}
            onChange={setStatus}
            minWidth={170}
          />

          <Select
            label="Filter by subject"
            value={subject}
            options={SUBJECT_FILTER_OPTIONS}
            onChange={setSubject}
            minWidth={180}
          />
        </div>

        <DataTable
          caption="Contact form inquiries"
          columns={columns}
          rows={rows}
          rowKey={(inquiry) => inquiry.id}
          loading={list.isLoading}
          error={list.isError ? errorMessage(list.error) : null}
          onRetry={() => void list.refetch()}
          skeletonRows={limit > 10 ? 10 : limit}
          emptyMessage="No inquiries match the selected filters."
          onRowClick={(inquiry) => setDialog({ kind: "detail", inquiry })}
        />

        {pagination && pagination.total > 0 ? (
          <Pagination
            page={page}
            pageSize={limit}
            total={pagination.total}
            onPageChange={setPage}
            onPageSizeChange={setLimit}
            itemLabel="inquiries"
          />
        ) : null}
      </Card>

      <InquiryDetailDialog
        open={dialog.kind === "detail"}
        inquiry={openInquiry}
        busy={updateInquiry.isPending}
        canManage={canManage}
        deniedReason={manageDenied}
        onClose={() => setDialog({ kind: "none" })}
        onSave={(input) => void onSave(input)}
      />

      <ConfirmDialog
        open={dialog.kind === "delete"}
        title="Remove Enquiry"
        description={
          dialog.kind === "delete"
            ? `The enquiry from ${dialog.inquiry.name} will be taken off the queue. It is retained in the audit record but will no longer appear here.`
            : ""
        }
        confirmLabel="Remove Enquiry"
        destructive
        busy={deleteInquiry.isPending}
        onConfirm={() => void onConfirmDelete()}
        onCancel={() => setDialog({ kind: "none" })}
      />
    </>
  );
}

/** First line of a message, trimmed to fit a table cell. */
function preview(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > 110 ? `${flat.slice(0, 110)}…` : flat;
}

/** A date the API sent, in the console's display format. */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not load the enquiry queue.";
}

export default ContactInquiriesPage;
