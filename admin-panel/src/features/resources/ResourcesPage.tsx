/**
 * Resource Directory — the support organisations shown to members.
 *
 * Verification is the column that matters here. These are the organisations the
 * platform points people to at their worst moment, so whether an entry has been
 * checked is shown on every row rather than buried in the detail view.
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
import { directoryResources } from "@/mocks/directoryResources";
import type { DirectoryResource } from "@/mocks/types";

const CATEGORY_OPTIONS = [
  { value: "All", label: "All Categories" },
  { value: "legal", label: "Legal Aid" },
  { value: "mental_health", label: "Mental Health" },
  { value: "housing", label: "Housing" },
  { value: "community", label: "Community" },
  { value: "emergency", label: "Emergency" },
];

const REACH_OPTIONS = [
  { value: "All", label: "All Reach" },
  { value: "National", label: "National" },
  { value: "Regional", label: "Regional" },
  { value: "Local", label: "Local" },
];

const VERIFY_OPTIONS = [
  { value: "All", label: "All Entries" },
  { value: "verified", label: "Verified Only" },
  { value: "unverified", label: "Unverified Only" },
];

const TABS = ["All", "Published", "Draft", "Archived"] as const;
type ResourceTab = (typeof TABS)[number];

function humanise(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ResourcesPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<ResourceTab>("All");
  const [category, setCategory] = useState("All");
  const [reach, setReach] = useState("All");
  const [verified, setVerified] = useState("All");

  useEffect(() => {
    document.title = `Resources · ${env.appName} Admin`;
  }, []);

  const filters = useMemo(
    () => [
      (r: DirectoryResource) => tab === "All" || r.status === tab,
      (r: DirectoryResource) => category === "All" || r.category === category,
      (r: DirectoryResource) => reach === "All" || r.reach === reach,
      (r: DirectoryResource) =>
        verified === "All" || (verified === "verified" ? r.verified : !r.verified),
    ],
    [tab, category, reach, verified],
  );

  const table = useLocalTable<DirectoryResource>({
    rows: directoryResources,
    searchFields: useMemo(
      () => (r: DirectoryResource) => [
        r.name,
        r.id,
        r.description,
        r.contact,
        r.regionsServed,
        ...r.tags,
      ],
      [],
    ),
    filters,
  });

  const columns: Column<DirectoryResource>[] = [
    {
      key: "name",
      header: "Organization & ID",
      width: "32%",
      render: (r) => (
        <>
          <div className="title-row-wrap">
            <span className="title-truncate" title={r.name}>
              {r.name}
            </span>
            {r.verified ? (
              <span className="verified-chip" title="Verified organisation">
                ✓ Verified
              </span>
            ) : null}
          </div>
          <span className="sub">{r.id}</span>
        </>
      ),
    },
    {
      key: "category",
      header: "Category",
      width: "16%",
      render: (r) => humanise(r.category),
    },
    {
      key: "reach",
      header: "Reach & Region",
      width: "20%",
      render: (r) => (
        <>
          <div style={{ fontSize: 13 }}>{r.reach}</div>
          <span className="sub">{r.regionsServed}</span>
        </>
      ),
    },
    {
      key: "contact",
      header: "Contact / Intake",
      width: "16%",
      cellClassName: "cell-truncate",
      render: (r) => r.contact,
    },
    {
      key: "status",
      header: "Status",
      width: "10%",
      render: (r) => (
        <Badge tone={r.status === "Published" ? "published" : "draft"}>{r.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "6%",
      align: "right",
      render: (r) => (
        <button
          type="button"
          className="action-icon-btn"
          aria-label={`Open ${r.name}`}
          title="Open resource"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/resources/${r.id}`);
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
        title="Resource Directory"
        description="Support organisations shown to members. Verify contact details before publishing an entry."
        actions={
          <Button
            variant="primary"
            className="add-keyword-btn"
            icon={<Icon name="plus" />}
            onClick={() => navigate("/resources/new")}
          >
            Add Resource
          </Button>
        }
      />

      <FixtureNotice module="The resource directory" />

      <Tabs
        label="Filter resources by status"
        items={TABS.map((value) => ({
          value,
          label: value,
          count:
            value === "All"
              ? directoryResources.length
              : directoryResources.filter((r) => r.status === value).length,
        }))}
        value={tab}
        onChange={setTab}
      />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder="Search organisations, regions, or tags…"
          label="Search the resource directory"
        />
        <Select
          label="Filter by category"
          value={category}
          options={CATEGORY_OPTIONS}
          onChange={setCategory}
          minWidth={165}
        />
        <Select
          label="Filter by reach"
          value={reach}
          options={REACH_OPTIONS}
          onChange={setReach}
          minWidth={140}
        />
        <Select
          label="Filter by verification"
          value={verified}
          options={VERIFY_OPTIONS}
          onChange={setVerified}
          minWidth={160}
        />
      </div>

      <DataTable
        caption="Support resource directory"
        columns={columns}
        rows={table.pageRows}
        rowKey={(r) => r.id}
        minWidth="1020px"
        emptyMessage="No resources match the selected filters."
        onRowClick={(r) => navigate(`/resources/${r.id}`)}
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel="resources"
        />
      ) : null}
    </Card>
  );
}

export default ResourcesPage;
