/**
 * Daily Briefing — choosing the stories that go out each day.
 *
 * Two lists, and moving a story between them is the whole job. The design has
 * unsaved changes as a real state with a save bar, which is kept: the briefing
 * goes out to every member, so committing on each click would be the wrong
 * default.
 */

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Card, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { newsStories } from "@/mocks/newsStories";
import type { NewsStory } from "@/mocks/types";

type BriefingTab = "included" | "available";

export function DailyBriefingPage() {
  const toast = useToast();

  const [tab, setTab] = useState<BriefingTab>("included");
  /** Ids currently in the briefing. Edited locally until saved. */
  const [included, setIncluded] = useState<Set<string>>(
    () => new Set(newsStories.filter((s) => s.dailyBriefing).map((s) => s.id)),
  );
  /** What was in the briefing when the screen loaded, to detect real changes. */
  const [saved, setSaved] = useState<Set<string>>(
    () => new Set(newsStories.filter((s) => s.dailyBriefing).map((s) => s.id)),
  );

  useEffect(() => {
    document.title = `Daily Briefing · ${env.appName} Admin`;
  }, []);

  const dirty = useMemo(() => {
    if (included.size !== saved.size) return true;
    // Same size is not the same set — a swap of one story for another leaves
    // the count unchanged.
    for (const id of included) if (!saved.has(id)) return true;
    return false;
  }, [included, saved]);

  /** Warn before leaving with unsaved changes. */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const rows = useMemo(
    () =>
      newsStories.filter((story) =>
        tab === "included" ? included.has(story.id) : !included.has(story.id),
      ),
    [tab, included],
  );

  const table = useLocalTable<NewsStory>({
    rows,
    searchFields: useMemo(
      () => (story: NewsStory) => [story.title, story.id, story.category, story.location],
      [],
    ),
  });

  const toggle = (id: string) =>
    setIncluded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const save = () => {
    setSaved(new Set(included));
    toast.success(
      "Briefing updated",
      `${included.size} ${included.size === 1 ? "story" : "stories"} will go out in tomorrow's briefing.`,
    );
  };

  const columns: Column<NewsStory>[] = [
    {
      key: "title",
      header: "Story",
      width: "44%",
      render: (story) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={story.title}>
              {story.title}
            </span>
          </div>
          <span className="sub">
            {story.id} · {story.location}
          </span>
        </>
      ),
    },
    { key: "category", header: "Category", width: "16%", render: (s) => s.category },
    {
      key: "published",
      header: "Published",
      width: "16%",
      render: (s) => <span style={{ fontSize: 12.5 }}>{s.publishedDate}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "12%",
      render: (story) => (
        <Badge tone={story.status === "Published" ? "published" : "draft"}>{story.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Briefing",
      width: "12%",
      align: "right",
      render: (story) => (
        <Button
          variant={included.has(story.id) ? "outline" : "primary"}
          onClick={() => toggle(story.id)}
        >
          {included.has(story.id) ? "Remove" : "Add"}
        </Button>
      ),
    },
  ];

  return (
    <Card className="cm-page">
      <PageHeader
        title="Daily Briefing"
        description="Choose the stories that go out in tomorrow's briefing. Changes take effect when you save."
        actions={
          <>
            <Button variant="outline" disabled={!dirty} onClick={() => setIncluded(new Set(saved))}>
              Discard
            </Button>
            <Button variant="primary" disabled={!dirty} onClick={save}>
              Save Briefing
            </Button>
          </>
        }
      />

      <FixtureNotice module="The daily briefing" />

      {dirty ? (
        <div className="login-warn-alert" style={{ display: "block" }} role="status">
          <strong>Unsaved changes.</strong> The briefing now holds {included.size}{" "}
          {included.size === 1 ? "story" : "stories"}. Save to publish the change.
        </div>
      ) : null}

      <Tabs
        label="Briefing contents"
        items={[
          {
            value: "included" as const,
            label: "In the briefing",
            count: included.size,
          },
          {
            value: "available" as const,
            label: "Available stories",
            count: newsStories.length - included.size,
          },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search stories…"
          label="Search briefing stories"
        />
      </div>

      <DataTable
        caption={tab === "included" ? "Stories in the briefing" : "Stories available to add"}
        columns={columns}
        rows={table.pageRows}
        rowKey={(story) => story.id}
        minWidth="900px"
        emptyMessage={
          tab === "included"
            ? "No stories are in the briefing yet."
            : "Every story is already in the briefing."
        }
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

export default DailyBriefingPage;
