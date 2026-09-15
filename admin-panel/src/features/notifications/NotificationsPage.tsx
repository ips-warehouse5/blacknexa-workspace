/**
 * Notifications & Announcements.
 *
 * Two tabs over two different things: announcements the team writes, and the
 * pushes that go out when a story publishes. They share a screen because they
 * share an audience and a delivery mechanism, and an operator asking "what did
 * we send members this week" means both.
 *
 * Delivery and open figures are shown per row. An announcement with a 3% open
 * rate is a problem worth seeing next to one at 70%.
 */

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Card, KpiCard, KpiGrid, PageHeader, Tabs } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { announcements } from "@/mocks/announcements";
import { newsNotifications } from "@/mocks/newsNotifications";
import type { Announcement, NewsNotification } from "@/mocks/types";

type NotificationTab = "announcements" | "news";

function humanise(value: string): string {
  if (value === "all") return "Everyone";
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** "Everyone" when a send was unfiltered, otherwise the segments it targeted. */
function audience(target: { targetRegion: string; targetRole: string; targetTier: string }) {
  const parts = [target.targetRegion, target.targetRole, target.targetTier]
    .filter((part) => part !== "all")
    .map(humanise);
  return parts.length === 0 ? "Everyone" : parts.join(" · ");
}

function statusTone(status: string) {
  if (status === "Sent") return "published" as const;
  if (status === "Scheduled") return "pending" as const;
  return "draft" as const;
}

export function NotificationsPage() {
  const [tab, setTab] = useState<NotificationTab>("announcements");

  useEffect(() => {
    document.title = `Notifications · ${env.appName} Admin`;
  }, []);

  const announcementTable = useLocalTable<Announcement>({
    rows: announcements,
    searchFields: useMemo(
      () => (a: Announcement) => [a.title, a.id, a.body, a.category],
      [],
    ),
  });

  const newsTable = useLocalTable<NewsNotification>({
    rows: newsNotifications,
    searchFields: useMemo(
      () => (n: NewsNotification) => [n.headline, n.id, n.summary, n.articleId],
      [],
    ),
  });

  const table = tab === "announcements" ? announcementTable : newsTable;

  // Totals across everything sent, for the summary tiles.
  const totals = useMemo(() => {
    const delivered = announcements.reduce((sum, a) => sum + a.deliveredCount, 0);
    const opened = announcements.reduce((sum, a) => sum + a.openedCount, 0);
    const pushed = newsNotifications.reduce((sum, n) => sum + n.sentCount, 0);
    return {
      delivered,
      opened,
      pushed,
      // Guarded: a fresh install has delivered nothing, and 0/0 is NaN on screen.
      openRate: delivered > 0 ? `${((opened / delivered) * 100).toFixed(1)}%` : "—",
    };
  }, []);

  const announcementColumns: Column<Announcement>[] = [
    {
      key: "title",
      header: "Announcement & ID",
      width: "34%",
      render: (item) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={item.title}>
              {item.title}
            </span>
          </div>
          <span className="sub">
            {item.id} · {item.channel}
          </span>
        </>
      ),
    },
    { key: "audience", header: "Audience", width: "18%", render: (item) => audience(item) },
    { key: "category", header: "Category", width: "14%", render: (item) => item.category },
    {
      key: "delivery",
      header: "Delivered / Opened",
      width: "16%",
      render: (item) => (
        <>
          <div style={{ fontSize: 13 }}>
            {item.deliveredCount.toLocaleString()} / {item.openedCount.toLocaleString()}
          </div>
          <span className="sub">{item.openRate} opened</span>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "10%",
      render: (item) => <Badge tone={statusTone(item.status)}>{item.status}</Badge>,
    },
    {
      key: "sent",
      header: "Sent",
      width: "8%",
      align: "right",
      render: (item) => (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{item.sentAt}</span>
      ),
    },
  ];

  const newsColumns: Column<NewsNotification>[] = [
    {
      key: "headline",
      header: "News Story & Headline",
      width: "38%",
      render: (item) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={item.headline}>
              {item.headline}
            </span>
          </div>
          <span className="sub">
            {item.id} · {item.articleId}
          </span>
        </>
      ),
    },
    { key: "audience", header: "Audience", width: "18%", render: (item) => audience(item) },
    {
      key: "delivery",
      header: "Sent / Opened",
      width: "18%",
      render: (item) => (
        <>
          <div style={{ fontSize: 13 }}>
            {item.sentCount.toLocaleString()} / {item.openCount.toLocaleString()}
          </div>
          <span className="sub">{item.openRate} opened</span>
        </>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "12%",
      render: (item) => <Badge tone={statusTone(item.status)}>{item.status}</Badge>,
    },
    {
      key: "sent",
      header: "Sent",
      width: "14%",
      align: "right",
      render: (item) => (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{item.sentAt}</span>
      ),
    },
  ];

  return (
    <Card className="cm-page">
      <PageHeader
        title="Notifications & Announcements"
        description="What the platform has sent to members, who received it, and how many opened it."
        actions={
          <Button variant="primary" className="add-keyword-btn" icon={<Icon name="plus" />}>
            New Announcement
          </Button>
        }
      />

      <FixtureNotice module="Notifications" />

      <KpiGrid columns={4} style={{ marginBottom: 20 }}>
        <KpiCard compact label="Announcements" value={announcements.length} />
        <KpiCard compact label="Delivered" value={totals.delivered.toLocaleString()} />
        <KpiCard compact label="Average Open Rate" value={totals.openRate} />
        <KpiCard compact label="News Pushes" value={totals.pushed.toLocaleString()} />
      </KpiGrid>

      <Tabs
        label="Notification type"
        items={[
          {
            value: "announcements" as const,
            label: "Announcements",
            count: announcements.length,
          },
          {
            value: "news" as const,
            label: "News Notifications",
            count: newsNotifications.length,
          },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder={
            tab === "announcements" ? "Search announcements…" : "Search news notifications…"
          }
          label="Search notifications"
        />
      </div>

      {tab === "announcements" ? (
        <DataTable
          caption="Platform announcements"
          columns={announcementColumns}
          rows={announcementTable.pageRows}
          rowKey={(item) => item.id}
          minWidth="980px"
          emptyMessage="No announcements match your search."
        />
      ) : (
        <DataTable
          caption="News notifications"
          columns={newsColumns}
          rows={newsTable.pageRows}
          rowKey={(item) => item.id}
          minWidth="980px"
          emptyMessage="No news notifications match your search."
        />
      )}

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel={tab === "announcements" ? "announcements" : "notifications"}
        />
      ) : null}
    </Card>
  );
}

export default NotificationsPage;
