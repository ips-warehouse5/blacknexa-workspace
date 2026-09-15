/**
 * Categories and tags share one screen shape, so they share one component.
 *
 * Both are a name, a slug, a usage count and an active flag; the only real
 * difference is the noun. Writing them twice would have guaranteed they drifted
 * — different validation, different empty states — for no benefit.
 *
 * Usage count is shown because deleting a taxonomy term that 40 stories use is
 * a different decision from deleting an unused one.
 */

import { useEffect, useMemo, useState } from "react";

import { useToast } from "@/app/providers/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput, Switch, TextField } from "@/components/ui/Fields";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Card, PageHeader } from "@/components/ui/Page";
import { Pagination } from "@/components/ui/Pagination";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { useLocalTable } from "@/hooks/useLocalTable";
import { newsStories } from "@/mocks/newsStories";

export interface TaxonomyTerm {
  id: string;
  name: string;
  slug: string;
  /** How many stories use this term. */
  usage: number;
  active: boolean;
}

/** URL-safe slug from a display name. */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface TaxonomyPageProps {
  /** Singular noun, e.g. "category". */
  noun: string;
  /** Plural noun, e.g. "categories". */
  plural: string;
  title: string;
  description: string;
  seed: TaxonomyTerm[];
}

export function TaxonomyPage({ noun, plural, title, description, seed }: TaxonomyPageProps) {
  const toast = useToast();

  const [terms, setTerms] = useState<TaxonomyTerm[]>(seed);
  const [editing, setEditing] = useState<TaxonomyTerm | null>(null);
  const [deleting, setDeleting] = useState<TaxonomyTerm | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${title} · ${env.appName} Admin`;
  }, [title]);

  const table = useLocalTable<TaxonomyTerm>({
    rows: terms,
    searchFields: useMemo(() => (term: TaxonomyTerm) => [term.name, term.slug], []),
  });

  const openNew = () => {
    setEditing({ id: "", name: "", slug: "", usage: 0, active: true });
    setDraftName("");
    setDraftActive(true);
    setNameError(null);
  };

  const openEdit = (term: TaxonomyTerm) => {
    setEditing(term);
    setDraftName(term.name);
    setDraftActive(term.active);
    setNameError(null);
  };

  const save = () => {
    const name = draftName.trim();
    if (name.length < 2) {
      setNameError(`Enter a ${noun} name.`);
      return;
    }

    const slug = toSlug(name);
    // A duplicate slug would make two terms indistinguishable in a URL, so the
    // check is on the slug rather than on the display name.
    const clash = terms.some((t) => t.slug === slug && t.id !== editing?.id);
    if (clash) {
      setNameError(`A ${noun} with that name already exists.`);
      return;
    }

    if (editing?.id) {
      setTerms((current) =>
        current.map((t) => (t.id === editing.id ? { ...t, name, slug, active: draftActive } : t)),
      );
      toast.success(`${noun} updated`, `${name} has been saved.`);
    } else {
      setTerms((current) => [
        { id: `${slug}-${Date.now()}`, name, slug, usage: 0, active: draftActive },
        ...current,
      ]);
      toast.success(`${noun} created`, `${name} is ready to use.`);
    }

    setEditing(null);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    setTerms((current) => current.filter((t) => t.id !== deleting.id));
    toast.success(`${noun} removed`, `${deleting.name} has been deleted.`);
    setDeleting(null);
  };

  const columns: Column<TaxonomyTerm>[] = [
    {
      key: "name",
      header: "Name",
      width: "38%",
      render: (term) => (
        <>
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>
            {term.name}
          </div>
          <span className="sub">/{term.slug}</span>
        </>
      ),
    },
    {
      key: "usage",
      header: "Used By",
      width: "20%",
      render: (term) => (
        <span>
          {term.usage} {term.usage === 1 ? "story" : "stories"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "20%",
      render: (term) => (
        <Badge tone={term.active ? "active" : "draft"}>
          {term.active ? "Active" : "Hidden"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: "22%",
      align: "right",
      render: (term) => (
        <div style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            type="button"
            className="action-icon-btn"
            aria-label={`Edit ${term.name}`}
            title="Edit"
            onClick={() => openEdit(term)}
          >
            <Icon name="edit" />
          </button>
          <button
            type="button"
            className="action-icon-btn delete-icon-btn"
            aria-label={`Delete ${term.name}`}
            title="Delete"
            onClick={() => setDeleting(term)}
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
        title={title}
        description={description}
        actions={
          <Button
            variant="primary"
            className="add-keyword-btn"
            icon={<Icon name="plus" />}
            onClick={openNew}
          >
            Add {noun}
          </Button>
        }
      />

      <FixtureNotice module={title} />

      <div className="filters">
        <SearchInput
          value={table.search}
          onChange={table.setSearch}
          placeholder={`Search ${plural}…`}
          label={`Search ${plural}`}
        />
      </div>

      <DataTable
        caption={title}
        columns={columns}
        rows={table.pageRows}
        rowKey={(term) => term.id}
        minWidth="720px"
        emptyMessage={`No ${plural} match your search.`}
      />

      {table.total > 0 ? (
        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
          itemLabel={plural}
        />
      ) : null}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${noun}` : `Add ${noun}`}
        description={`The slug is generated from the name and used in story URLs.`}
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              {editing?.id ? "Save Changes" : `Create ${noun}`}
            </Button>
          </>
        }
      >
        <TextField
          label="Name"
          value={draftName}
          error={nameError ?? undefined}
          hint={draftName.trim() ? `Slug: /${toSlug(draftName)}` : undefined}
          onChange={(e) => {
            setDraftName(e.target.value);
            setNameError(null);
          }}
        />

        <Switch
          checked={draftActive}
          onChange={setDraftActive}
          label="Active"
          hint={`Hidden ${plural} stay on existing stories but cannot be assigned to new ones.`}
        />
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${noun}`}
        description={
          deleting
            ? deleting.usage > 0
              ? `“${deleting.name}” is used by ${deleting.usage} ${deleting.usage === 1 ? "story" : "stories"}. Those stories will lose this ${noun}.`
              : `“${deleting.name}” is not used by any story and can be removed safely.`
            : ""
        }
        confirmLabel={`Delete ${noun}`}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

/** Categories, derived from the stories that use them. */
export function categorySeed(): TaxonomyTerm[] {
  const counts = new Map<string, number>();
  for (const story of newsStories) {
    counts.set(story.category, (counts.get(story.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, usage]) => ({
      id: toSlug(name),
      name,
      slug: toSlug(name),
      usage,
      active: true,
    }));
}

export default TaxonomyPage;
