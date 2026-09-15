/**
 * Rights & Guidance — the educational articles shown in-app.
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
import { educationalArticles } from "@/mocks/educationalArticles";
import type { EducationalArticle } from "@/mocks/types";

const TABS = ["All", "Published", "Draft"] as const;
type ArticleTab = (typeof TABS)[number];

export function ArticlesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ArticleTab>("All");
  const [category, setCategory] = useState("All");

  useEffect(() => {
    document.title = `Rights & Guidance · ${env.appName} Admin`;
  }, []);

  const categories = useMemo(
    () => [
      { value: "All", label: "All Categories" },
      ...[...new Set(educationalArticles.map((a) => a.category))]
        .sort()
        .map((c) => ({ value: c, label: c })),
    ],
    [],
  );

  const filters = useMemo(
    () => [
      (a: EducationalArticle) => tab === "All" || a.status === tab,
      (a: EducationalArticle) => category === "All" || a.category === category,
    ],
    [tab, category],
  );

  const table = useLocalTable<EducationalArticle>({
    rows: educationalArticles,
    searchFields: useMemo(
      () => (a: EducationalArticle) => [a.title, a.id, a.content, a.category],
      [],
    ),
    filters,
  });

  const columns: Column<EducationalArticle>[] = [
    {
      key: "title",
      header: "Title & ID",
      width: "44%",
      render: (article) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={article.title}>
              {article.title}
            </span>
          </div>
          <span className="sub">{article.id}</span>
        </>
      ),
    },
    { key: "category", header: "Category", width: "20%", render: (a) => a.category },
    {
      key: "updated",
      header: "Last Updated",
      width: "16%",
      render: (a) => <span style={{ fontSize: 12.5 }}>{a.updated}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "12%",
      render: (article) => (
        <Badge tone={article.status === "Published" ? "published" : "draft"}>
          {article.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "8%",
      align: "right",
      render: (article) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="action-icon-btn"
            aria-label={`Open ${article.title}`}
            title="Open article"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/content/articles/${article.id}`);
            }}
          >
            <Icon name="eye" />
          </button>
          <button
            type="button"
            className="action-icon-btn"
            aria-label={`Edit ${article.title}`}
            title="Edit article"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/content/articles/${article.id}/edit`);
            }}
          >
            <Icon name="edit" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <Card className="cm-page">
      <PageHeader
        title="Rights & Guidance"
        description="Educational articles explaining members' rights and what to do after an incident."
        actions={
          <Button
            variant="primary"
            className="add-keyword-btn"
            icon={<Icon name="plus" />}
            onClick={() => navigate("/content/articles/new")}
          >
            New Article
          </Button>
        }
      />

      <FixtureNotice module="Rights & guidance" />

      <Tabs
        label="Filter articles by status"
        items={TABS.map((value) => ({
          value,
          label: value,
          count:
            value === "All"
              ? educationalArticles.length
              : educationalArticles.filter((a) => a.status === value).length,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search articles…"
          label="Search articles"
        />
        <Select
          label="Filter by category"
          value={category}
          options={categories}
          onChange={setCategory}
          minWidth={175}
        />
      </div>

      <DataTable
        caption="Rights and guidance articles"
        columns={columns}
        rows={table.pageRows}
        rowKey={(article) => article.id}
        minWidth="820px"
        emptyMessage="No articles match the selected filters."
        onRowClick={(article) => navigate(`/content/articles/${article.id}`)}
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="articles"
        />
      ) : null}
    </Card>
  );
}

export default ArticlesPage;
