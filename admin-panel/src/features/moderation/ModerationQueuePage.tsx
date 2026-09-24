/**
 * Content Moderation — the review queue (plan §8.2, prototype `section_queue`).
 *
 * One row per moderation **case**: a held or flagged report, or a comment,
 * raised by the automated pipeline (AI verdict, keyword rules, unassessed
 * media) or by members' flags. Paging, filtering, search and sort all happen on
 * the server (`GET /admin/moderation/cases`), and the tab counts come from
 * `/cases/summary`, which counts every open case rather than the page on screen.
 *
 * Tabs follow §8.2: the four sources (AI · Keyword · User flags · Media review)
 * then the eight policy categories. Graphic and Other appear only while they
 * have open cases — they are the two the prototype never showed, and an empty
 * tab on a thirteen-wide strip is noise. The Resolved view shows every tab
 * without counts, because the summary counts open cases only and a number that
 * describes a different list would mislead.
 *
 * "Flag By" is one badge per source rather than a single winner, so the column
 * stays on every tab: on the AI tab a case can still carry member flags, and
 * that is worth seeing before opening it.
 *
 * The filters live in the URL (see `moderation.queue.ts`), so opening a case and
 * coming back returns to the same tab, page and search — and the detail page's
 * previous/next walks the whole filtered queue, starting from the rows this
 * page was showing (review Q12).
 *
 * Column widths (review Q14): the columns whose content has a fixed size — the
 * submitted date and the one-button Actions cell — are sized in pixels, and
 * Title takes whatever the percentage columns leave. With Actions at 6% the
 * header "ACTIONS" was clipped at 1440px (fixed layout, `overflow: hidden`),
 * and "SUBMITTED AT" was a few pixels short at 11%.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput, Switch } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select, type SelectOption } from "@/components/ui/Select";
import env from "@/config/env";
import {
  FlagByBadges,
  ResolutionBadge,
  RiskPills,
} from "@/features/moderation/components/CaseBadges";
import { formatDate, formatTime } from "@/features/moderation/moderation.format";
import { useCaseList, useCaseSummary } from "@/features/moderation/moderation.hooks";
import {
  PAGE_SIZES,
  queueNavState,
  readQueueParams,
  writeQueueParams,
} from "@/features/moderation/moderation.queue";
import {
  POLICY_CATEGORY_LABELS,
  QUEUE_TABS,
  REPORT_CATEGORY_LABELS,
  type CaseListItem,
  type CaseListParams,
  type CaseSort,
  type ModerationQueueTab,
} from "@/features/moderation/moderation.types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { ApiError } from "@/types/api";

/** Sort choices. The hints say what "newest" means on each view — it differs. */
function sortOptions(resolved: boolean): SelectOption<CaseSort>[] {
  return [
    { value: "priority", label: "Priority", hint: "Safety and urgent cases first" },
    {
      value: "newest",
      label: "Newest First",
      hint: resolved ? "Most recently decided" : "Most recently opened",
    },
    {
      value: "oldest",
      label: "Oldest First",
      hint: resolved ? "Decided longest ago" : "Waiting longest",
    },
  ];
}

export function ModerationQueuePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => readQueueParams(searchParams), [searchParams]);
  const resolvedView = params.state === "resolved";

  /*
   * Every change replaces the history entry rather than pushing one, so Back
   * leaves the queue instead of stepping through each tab the moderator
   * clicked. Filter changes also return to page one — page 7 of one tab is
   * rarely page 7 of another — and that is written into the same update, so
   * the request is made once with the right page.
   */
  const updateParams = useCallback(
    (patch: Partial<CaseListParams>) => {
      setSearchParams(
        (current) => writeQueueParams({ ...readQueueParams(current), ...patch }),
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // The box is seeded from the URL once; typing is local until it settles.
  const [searchText, setSearchText] = useState(params.search);
  const debouncedSearch = useDebouncedValue(searchText, 300);

  useEffect(() => {
    const next = debouncedSearch.trim();
    if (next === params.search.trim()) return;
    updateParams({ search: next, page: 1 });
  }, [debouncedSearch, params.search, updateParams]);

  const list = useCaseList(params);
  const summary = useCaseSummary();

  useEffect(() => {
    document.title = `Content Moderation · ${env.appName} Admin`;
  }, []);

  const rows = list.data?.items ?? [];
  const pagination = list.data?.pagination;

  /*
   * Deciding cases shrinks the open list, so the page a moderator is on can
   * stop existing underneath them (page 3 of what is now two pages). Step back
   * to the last real page instead of showing an empty table with a footer
   * that says there are results.
   */
  useEffect(() => {
    if (!pagination || pagination.total === 0) return;
    const lastPage = Math.max(1, Math.ceil(pagination.total / params.limit));
    if (params.page > lastPage) updateParams({ page: lastPage });
  }, [pagination, params.page, params.limit, updateParams]);

  const tabItems = useMemo(() => {
    const counts = summary.data?.tabs;
    return QUEUE_TABS.filter((tab) => {
      if (!tab.hideWhenEmpty || resolvedView) return true;
      // Kept while selected, so deciding the last graphic case does not pull
      // the tab out from under the moderator mid-click.
      return tab.value === params.tab || (counts?.[tab.value] ?? 0) > 0;
    }).map((tab) => ({
      value: tab.value,
      label: tab.label,
      ...(counts && !resolvedView ? { count: counts[tab.value] ?? 0 } : {}),
    }));
  }, [summary.data, resolvedView, params.tab]);

  const openCase = (item: CaseListItem) => {
    navigate(`/moderation/${item.id}`, {
      state: queueNavState({
        ids: rows.map((row) => row.id),
        search: location.search,
        // Where this page sits in the whole queue, so the detail page can show
        // the global position and page past either end (review Q12).
        offset: (params.page - 1) * params.limit,
        total: pagination?.total ?? rows.length,
      }),
    });
  };

  const columns: Column<CaseListItem>[] = [
    {
      key: "title",
      header: "Title & ID",
      // No width: Title takes what the other columns leave (review Q14).
      render: (item) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={item.title}>
              {item.targetType === "comment" ? `“${item.title}”` : item.title}
            </span>
            <RiskPills urgent={item.urgent} safetyRisk={item.safetyRisk} />
          </div>
          <span className="sub">
            {item.targetType === "comment"
              ? `Comment · On ${item.report.caseRef}`
              : item.report.caseRef}
          </span>
        </>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "8%",
      render: (item) => (
        <span
          className={`badge type-badge ${
            item.targetType === "comment" ? "type-comment" : "type-incident"
          }`}
        >
          {item.targetType === "comment" ? "Comment" : "Incident"}
        </span>
      ),
    },
    {
      key: "user",
      header: "User Name",
      width: resolvedView ? "11%" : "12%",
      cellClassName: "cell-truncate",
      render: (item) =>
        item.author ? (
          item.author.displayName
        ) : (
          <span style={{ color: "var(--muted)" }}>Deleted account</span>
        ),
    },
    {
      key: "category",
      header: "Category",
      width: resolvedView ? "12%" : "13%",
      render: (item) => (
        <>
          <div>{REPORT_CATEGORY_LABELS[item.category] ?? item.category}</div>
          {item.categories.length > 0 ? (
            // What the case is *about*, policy-wise — the incident category
            // above says what happened to the author, which is not the same.
            <span
              className="sub"
              title={item.categories.map((code) => POLICY_CATEGORY_LABELS[code]).join(", ")}
            >
              {item.categories.map((code) => POLICY_CATEGORY_LABELS[code]).join(" · ")}
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "location",
      header: "Location",
      width: resolvedView ? "10%" : "12%",
      cellClassName: "cell-truncate",
      render: (item) => item.location ?? <span style={{ color: "var(--muted)" }}>—</span>,
    },
    {
      key: "submitted",
      header: "Submitted At",
      width: "132px",
      render: (item) => (
        <>
          <div>{formatDate(item.submittedAt)}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
            {formatTime(item.submittedAt)}
          </div>
        </>
      ),
    },
    {
      key: "flagBy",
      header: "Flag By",
      width: resolvedView ? "9%" : "12%",
      render: (item) => <FlagByBadges sources={item.sources} />,
    },
    ...(resolvedView
      ? [
          {
            key: "resolution",
            header: "Resolution",
            width: "11%",
            render: (item: CaseListItem) =>
              item.resolution ? (
                <>
                  <ResolutionBadge resolution={item.resolution} />
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>
                    {formatDate(item.resolvedAt)}
                  </div>
                </>
              ) : (
                <span style={{ color: "var(--muted)" }}>—</span>
              ),
          },
        ]
      : []),
    {
      key: "actions",
      header: "Actions",
      width: "84px",
      render: (item) => (
        <button
          type="button"
          className="action-icon-btn"
          aria-label={`Review ${item.report.caseRef}`}
          title="Review content"
          onClick={(event) => {
            // The row opens the case too; without this the click would reach
            // the row handler as well and navigate twice.
            event.stopPropagation();
            openCase(item);
          }}
        >
          <Icon name="eye" />
        </button>
      ),
    },
  ];

  const emptyMessage = params.search
    ? "No cases match your search."
    : resolvedView
      ? "No resolved cases under this tab yet."
      : "No items require moderation.";

  return (
    <Card>
      <PageHeader
        title="Content Moderation"
        description="Review and moderate community posts and comments flagged by automated AI and user reports."
        actions={
          summary.data ? (
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
              <strong style={{ color: "var(--text)" }}>{summary.data.open}</strong> open
              {summary.data.urgent > 0 ? ` · ${summary.data.urgent} urgent` : ""}
              {summary.data.safety > 0 ? ` · ${summary.data.safety} safety` : ""}
            </span>
          ) : null
        }
      />

      <Tabs<ModerationQueueTab>
        label="Filter the queue by flag source or policy category"
        items={tabItems}
        value={params.tab}
        onChange={(tab) => updateParams({ tab, page: 1 })}
      />

      <div className="filters" style={{ flexWrap: "wrap" }}>
        <SearchInput
          value={searchText}
          onChange={setSearchText}
          placeholder="Search by BNX reference, title or author…"
          label="Search the moderation queue"
          style={{ flex: 1, maxWidth: 440, minWidth: 260, margin: 0 }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Switch
            checked={resolvedView}
            label="Resolved cases"
            onChange={(checked) =>
              updateParams({
                state: checked ? "resolved" : "open",
                // Each view opens in the order that suits it: open cases by
                // priority, decisions most recent first.
                sort: checked ? "newest" : "priority",
                page: 1,
              })
            }
          />
          <Select<CaseSort>
            label="Sort order"
            value={params.sort}
            options={sortOptions(resolvedView)}
            onChange={(sort) => updateParams({ sort, page: 1 })}
            minWidth={170}
          />
        </div>
      </div>

      <DataTable
        caption={resolvedView ? "Resolved moderation cases" : "Content awaiting moderation"}
        columns={columns}
        rows={rows}
        rowKey={(item) => item.id}
        minWidth="1040px"
        loading={list.isLoading}
        error={list.isError ? errorMessage(list.error) : null}
        onRetry={() => void list.refetch()}
        skeletonRows={params.limit > 10 ? 10 : params.limit}
        emptyMessage={emptyMessage}
        onRowClick={openCase}
      />

      {pagination && pagination.total > 0 ? (
        <Pagination
          page={params.page}
          pageSize={params.limit}
          total={pagination.total}
          pageSizeOptions={PAGE_SIZES}
          onPageChange={(page) => updateParams({ page })}
          onPageSizeChange={(limit) => updateParams({ limit, page: 1 })}
          itemLabel="items"
        />
      ) : null}
    </Card>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Could not load the moderation queue.";
}

export default ModerationQueuePage;
