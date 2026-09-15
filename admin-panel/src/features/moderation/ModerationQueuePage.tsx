/**
 * Content Moderation — the review queue.
 *
 * Posts and comments flagged either by the automated rules or by other users.
 * The "Flag By" column is hidden on the two source tabs, because on those the
 * column would say the same thing in every row.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import {
  ALL_TABS,
  countForTab,
  matchesTab,
  searchableFields,
} from "@/features/moderation/moderation.filters";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { moderationPosts } from "@/mocks/moderationPosts";
import type { ModerationPost } from "@/mocks/types";

type SortOrder = "newest" | "oldest";

const SORT_OPTIONS = [
  { value: "newest" as const, label: "Newest First" },
  { value: "oldest" as const, label: "Oldest First" },
];

/** Splits "Aug 27, 2026  09:41 AM" into its date and time halves. */
function splitTimestamp(value: string): [date: string, time: string | null] {
  const parts = value.split(/ {2}| · /);
  return parts.length === 2 ? [parts[0]!, parts[1]!] : [value, null];
}

export function ModerationQueuePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("All");
  const [sort, setSort] = useState<SortOrder>("newest");

  useEffect(() => {
    document.title = `Content Moderation · ${env.appName} Admin`;
  }, []);

  // Memoised because `useLocalTable` treats these as dependencies — a new
  // array identity every render would recompute the whole list each time.
  const filters = useMemo(
    () => [(post: ModerationPost) => matchesTab(post, tab)],
    [tab],
  );

  /*
   * The fixtures are already stored newest-first, and their timestamps are
   * display strings rather than parseable dates. Reversing the source list is
   * therefore both correct and honest about what it knows — a comparator over
   * "Aug 27, 2026  09:41 AM" would only look more rigorous.
   */
  const rows = useMemo(
    () => (sort === "oldest" ? [...moderationPosts].reverse() : moderationPosts),
    [sort],
  );

  const table = useLocalTable<ModerationPost>({
    rows,
    searchFields: searchableFields,
    filters,
  });

  // On a source tab every row has the same flag origin, so the column is noise.
  const showFlagBy = tab !== "AI Flag Reports" && tab !== "User Flag Reports";

  const columns: Column<ModerationPost>[] = [
    {
      key: "title",
      header: "Title & ID",
      width: showFlagBy ? "27%" : "32%",
      render: (post) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={post.title}>
              {post.title}
            </span>
            {post.urgent ? <span className="urgent">URGENT</span> : null}
          </div>
          <span className="sub">
            {post.id}
            {post.parentIncident ? ` · On ${post.parentIncident.split(" ")[0]}` : ""}
          </span>
        </>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "10%",
      render: (post) => (
        <span className={`badge type-badge type-${post.type.toLowerCase()}`}>{post.type}</span>
      ),
    },
    { key: "user", header: "User Name", width: "14%", render: (post) => post.user },
    { key: "category", header: "Category", width: "12%", render: (post) => post.category },
    {
      key: "location",
      header: "Location",
      width: showFlagBy ? "14%" : "17%",
      render: (post) => post.location,
    },
    {
      key: "submitted",
      header: "Submitted At",
      width: "12%",
      render: (post) => {
        const [date, time] = splitTimestamp(post.submitted);
        return (
          <>
            <div>{date}</div>
            {time ? (
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{time}</div>
            ) : null}
          </>
        );
      },
    },
    ...(showFlagBy
      ? [
          {
            key: "flagBy",
            header: "Flag By",
            width: "8%",
            render: (post: ModerationPost) => (
              <span
                className={`badge flag-badge flag-${post.reports.length > 0 ? "user" : "ai"}`}
              >
                {post.reports.length > 0 ? "User" : "AI"}
              </span>
            ),
          },
        ]
      : []),
    {
      key: "actions",
      header: "Actions",
      width: "8%",
      render: (post) => (
        <button
          type="button"
          className="action-icon-btn"
          aria-label={`Review ${post.title}`}
          title="Review content"
          onClick={() => navigate(`/moderation/${post.id}`)}
        >
          <Icon name="eye" />
        </button>
      ),
    },
  ];

  return (
    <Card>
      <PageHeader
        title="Content Moderation"
        description="Review and moderate community posts and comments flagged by automated AI and user reports."
      />

      <FixtureNotice module="The moderation queue" />

      <Tabs
        label="Filter the queue by flag category"
        items={ALL_TABS.map((value) => ({
          value,
          label: value,
          count: countForTab(moderationPosts, value),
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search posts…"
          label="Search the moderation queue"
        />
        <Select
          label="Sort order"
          value={sort}
          options={SORT_OPTIONS}
          onChange={setSort}
          minWidth={160}
        />
      </div>

      <DataTable
        caption="Content awaiting moderation"
        columns={columns}
        rows={table.pageRows}
        rowKey={(post) => post.id}
        minWidth="980px"
        emptyMessage="No items require moderation."
        onRowClick={(post) => navigate(`/moderation/${post.id}`)}
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="items"
        />
      ) : null}
    </Card>
  );
}

export default ModerationQueuePage;
