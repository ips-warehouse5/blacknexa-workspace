/**
 * Edit one legal document.
 *
 * Sections are edited individually and can be reordered, because a legal
 * document is a numbered structure rather than a blob of prose — renumbering by
 * hand in a single textarea is exactly how clauses get lost.
 *
 * Publishing bumps the version, and the screen says what that costs: every
 * member is asked to accept the document again.
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useToast } from "@/app/providers/ToastProvider";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TextField } from "@/components/ui/Fields";
import { Card, PageHeader } from "@/components/ui/Page";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { legalDocuments } from "@/mocks/legalDocuments";
import type { LegalDocumentSection } from "@/mocks/types";

export function LegalEditorPage() {
  const { documentType } = useParams<{ documentType: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const source = documentType ? legalDocuments[documentType] : undefined;

  const [sections, setSections] = useState<LegalDocumentSection[]>(source?.sections ?? []);
  const [footer, setFooter] = useState(source?.footer ?? "");
  const [publishing, setPublishing] = useState(false);

  /** Snapshot of what was loaded, to tell a real edit from a re-render. */
  const original = useMemo(
    () => JSON.stringify({ sections: source?.sections ?? [], footer: source?.footer ?? "" }),
    [source],
  );
  const dirty = JSON.stringify({ sections, footer }) !== original;

  useEffect(() => {
    document.title = source
      ? `${source.title} · ${env.appName} Admin`
      : `Not found · ${env.appName} Admin`;
  }, [source]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!source) {
    return (
      <Card>
        <div className="page-placeholder">
          <h2>Document not found</h2>
          <p>No legal document matches “{documentType}”.</p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" to="/content/legal">
              Back to legal content
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const update = (index: number, patch: Partial<LegalDocumentSection>) =>
    setSections((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  /** Swap a section with its neighbour, which is all reordering needs here. */
  const move = (index: number, delta: -1 | 1) =>
    setSections((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const a = next[index]!;
      const b = next[target]!;
      next[index] = b;
      next[target] = a;
      return next;
    });

  const publish = () => {
    toast.success(
      "Document published",
      "Members will be asked to accept the new version the next time they open the app.",
    );
    setPublishing(false);
    navigate("/content/legal");
  };

  return (
    <Card className="cm-page">
      <PageHeader
        title={source.title}
        description={`Version ${source.version} · ${source.updated}`}
        actions={
          <>
            <Button
              variant="outline"
              disabled={!dirty}
              onClick={() => {
                setSections(source.sections);
                setFooter(source.footer);
              }}
            >
              Discard
            </Button>
            <Button variant="primary" disabled={!dirty} onClick={() => setPublishing(true)}>
              Publish New Version
            </Button>
          </>
        }
      />

      <FixtureNotice module="Legal document editing" />

      {dirty ? (
        <div className="login-warn-alert" style={{ display: "block" }} role="status">
          <strong>Unsaved changes.</strong> Publishing creates a new version and asks every
          member to accept it again.
        </div>
      ) : null}

      {sections.map((section, index) => (
        <div className="cm-section-box" key={index}>
          <div className="cm-section-head">
            <span className="cm-section-num">{index + 1}</span>
            <span style={{ flex: 1 }}>Section {index + 1}</span>

            <div style={{ display: "inline-flex", gap: 6 }}>
              <button
                type="button"
                className="action-icon-btn"
                aria-label={`Move section ${index + 1} up`}
                title="Move up"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="action-icon-btn"
                aria-label={`Move section ${index + 1} down`}
                title="Move down"
                disabled={index === sections.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="action-icon-btn delete-icon-btn"
                aria-label={`Delete section ${index + 1}`}
                title="Delete section"
                onClick={() => setSections((c) => c.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          </div>

          <TextField
            label={`Heading for section ${index + 1}`}
            value={section.heading}
            onChange={(e) => update(index, { heading: e.target.value })}
          />

          <label htmlFor={`legal-body-${index}`}>Body</label>
          <textarea
            id={`legal-body-${index}`}
            rows={5}
            value={section.body}
            onChange={(e) => update(index, { body: e.target.value })}
          />
        </div>
      ))}

      <div style={{ margin: "16px 0" }}>
        <Button
          variant="outline"
          icon={<span aria-hidden="true">+</span>}
          onClick={() =>
            setSections((current) => [
              ...current,
              { heading: `${current.length + 1}. New section`, body: "" },
            ])
          }
        >
          Add Section
        </Button>
      </div>

      <div className="cm-section-box">
        <div className="cm-section-head">Footer</div>
        <TextField
          label="Contact line"
          value={footer}
          hint="Printed at the end of the document."
          onChange={(e) => setFooter(e.target.value)}
        />
      </div>

      <ConfirmDialog
        open={publishing}
        title="Publish a new version"
        description="Every member will be asked to accept this document again before they can use protected features. This cannot be undone without publishing a further version."
        confirmLabel="Publish"
        onConfirm={publish}
        onCancel={() => setPublishing(false)}
      />
    </Card>
  );
}

export default LegalEditorPage;
