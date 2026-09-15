/**
 * News Management — the story list.
 *
 * Two columns carry weight beyond their size: verification, because an
 * unverified story on this platform is a liability, and audio, because a story
 * whose narration failed to generate is published but incomplete.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { newsStories } from "@/mocks/newsStories";
import type { NewsStory } from "@/mocks/types";

const TABS = ["All", "Published", "Draft", "Scheduled", "Archived"] as const;
type NewsTab = (typeof TABS)[number];

const SCOPE_OPTIONS = [
  { value: "All", label: "All Scopes" },
  { value: "Global", label: "Global" },
  { value: "National", label: "National" },
  { value: "Local", label: "Local" },
];

const VERIFY_OPTIONS = [
  { value: "All", label: "All Stories" },
  { value: "verified", label: "Verified Only" },
  { value: "unverified", label: "Unverified Only" },
];

/** Categories present in the data, so the filter never offers an empty option. */
function categoryOptions(stories: readonly NewsStory[]) {
  const unique = [...new Set(stories.map((s) => s.category))].sort();
  return [{ value: "All", label: "All Categories" }, ...unique.map((c) => ({ value: c, label: c }))];
}

export function NewsPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<NewsTab>("All");
  const [category, setCategory] = useState("All");
  const [scope, setScope] = useState("All");
  const [verified, setVerified] = useState("All");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  useEffect(() => {
    document.title = `News · ${env.appName} Admin`;
  }, []);

  const rows = useMemo(
    () => (sort === "oldest" ? [...newsStories].reverse() : newsStories),
    [sort],
  );

  const filters = useMemo(
    () => [
      (s: NewsStory) => tab === "All" || s.status === tab,
      (s: NewsStory) => category === "All" || s.category === category,
      (s: NewsStory) => scope === "All" || s.scope === scope,
      (s: NewsStory) =>
        verified === "All" || (verified === "verified" ? s.verified : !s.verified),
    ],
    [tab, category, scope, verified],
  );

  const table = useLocalTable<NewsStory>({
    rows,
    searchFields: useMemo(
      () => (s: NewsStory) => [s.title, s.id, s.summary, s.location, s.category],
      [],
    ),
    filters,
  });

  const columns: Column<NewsStory>[] = [
    {
      key: "title",
      header: "Title & ID",
      width: "27%",
      render: (story) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={story.title}>
              {story.title}
            </span>
            {story.verified ? (
              <span className="verified-chip" title="Verified story">
                ✓
              </span>
            ) : null}
          </div>
          <span className="sub">
            {story.id} · {story.chars.toLocaleString()} chars
          </span>
        </>
      ),
    },
    { key: "category", header: "Category", width: "13%", render: (s) => s.category },
    {
      key: "scope",
      header: "Scope",
      width: "10%",
      render: (s) => <span className="badge approved">{s.scope}</span>,
    },
    {
      key: "location",
      header: "Location",
      width: "13%",
      cellClassName: "cell-truncate",
      render: (s) => s.location,
    },
    {
      key: "audio",
      header: "Audio",
      width: "10%",
      render: (story) => (
        <span
          className={`badge ${story.audioStatus === "Ready" ? "published" : "draft"}`}
          title={story.audioStatus === "Ready" ? story.audioDuration : "No narration yet"}
        >
          {story.audioStatus}
        </span>
      ),
    },
    {
      key: "published",
      header: "Publish Date",
      width: "13%",
      render: (s) => <span style={{ fontSize: 12.5 }}>{s.publishedDate}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "9%",
      render: (story) => (
        <Badge tone={story.status === "Published" ? "published" : "draft"}>{story.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "5%",
      align: "right",
      render: (story) => (
        <button
          type="button"
          className="action-icon-btn"
          aria-label={`Open ${story.title}`}
          title="Open story"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/news/${story.id}`);
          }}
        >
          <Icon name="eye" />
        </button>
      ),
    },
  ];

  return (
    <Card>
      <PageHeader
        title="News Management"
        description="Stories published to the member feed, with their sources, narration, and distribution scope."
        actions={
          <Button
            variant="primary"
            className="add-keyword-btn"
            icon={<Icon name="plus" />}
            onClick={() => navigate("/news/new")}
          >
            New Story
          </Button>
        }
      />

      <FixtureNotice module="News management" />

      <Tabs
        label="Filter stories by status"
        items={TABS.map((value) => ({
          value,
          label: value,
          count:
            value === "All"
              ? newsStories.length
              : newsStories.filter((s) => s.status === value).length,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search stories…"
          label="Search news stories"
        />
        <Select
          label="Filter by category"
          value={category}
          options={categoryOptions(newsStories)}
          onChange={setCategory}
          minWidth={165}
        />
        <Select
          label="Filter by scope"
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={setScope}
          minWidth={140}
        />
        <Select
          label="Filter by verification"
          value={verified}
          options={VERIFY_OPTIONS}
          onChange={setVerified}
          minWidth={155}
        />
        <Select
          label="Sort order"
          value={sort}
          options={[
            { value: "newest" as const, label: "Newest First" },
            { value: "oldest" as const, label: "Oldest First" },
          ]}
          onChange={setSort}
          minWidth={145}
        />
      </div>

      <DataTable
        caption="News stories"
        columns={columns}
        rows={table.pageRows}
        rowKey={(story) => story.id}
        minWidth="1100px"
        emptyMessage="No stories match the selected filters."
        onRowClick={(story) => navigate(`/news/${story.id}`)}
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="stories"
        />
      ) : null}
    </Card>
  );
}

export default NewsPage;
