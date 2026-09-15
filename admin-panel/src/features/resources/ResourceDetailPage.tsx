/**
 * Resource detail — one directory entry.
 */

import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Page";
import env from "@/config/env";
import { directoryResources } from "@/mocks/directoryResources";

function humanise(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{value}</div>
    </div>
  );
}

export function ResourceDetailPage() {
  const { resourceId } = useParams<{ resourceId: string }>();
  const navigate = useNavigate();

  const resource = useMemo(
    () => directoryResources.find((r) => r.id === resourceId),
    [resourceId],
  );

  useEffect(() => {
    document.title = resource
      ? `${resource.name} · ${env.appName} Admin`
      : `Not found · ${env.appName} Admin`;
  }, [resource]);

  if (!resource) {
    return (
      <Card>
        <div className="page-placeholder">
          <h2>Resource not found</h2>
          <p>No directory entry matches “{resourceId}”.</p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" to="/resources">
              Back to resources
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="details-page">
      <div className="details-top-bar" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="back-btn-pill"
            title="Back to resources"
            aria-label="Back to the resource directory"
            onClick={() => navigate("/resources")}
          >
            ←
          </button>
          <div className="meta-chip-wrap">
            <strong>{resource.id}</strong>
            <Badge tone={resource.status === "Published" ? "published" : "draft"}>
              {resource.status}
            </Badge>
            {resource.verified ? <span className="verified-chip">✓ Verified</span> : null}
          </div>
        </div>

        <Button variant="primary" onClick={() => navigate(`/resources/${resource.id}/edit`)}>
          Edit Resource
        </Button>
      </div>

      <h1 className="details-main-title">{resource.name}</h1>

      <div className="details-grid">
        <div className="details-left">
          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Organisation Details</div>
            </div>
            <div className="content-info-grid">
              <InfoCell label="Category" value={humanise(resource.category)} />
              <InfoCell label="Reach" value={resource.reach} />
              <InfoCell label="Regions Served" value={resource.regionsServed} />
              <InfoCell label="Contact / Intake" value={resource.contact} />
              <InfoCell label="Added By" value={resource.author} />
              <InfoCell label="Added On" value={resource.createdDate} />
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Description</div>
            </div>
            <div className="content-body-text">{resource.description}</div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Tags</div>
            </div>
            <div className="keywords">
              {resource.tags.map((tag) => (
                <span className="keyword-chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="details-right">
          <div className="action-card">
            <div className="action-card-title">Verification</div>
            <div className="action-help-text" style={{ marginTop: 0 }}>
              {resource.verified
                ? "Contact details were checked and confirmed. Re-verify if the organisation moves or changes its intake process."
                : "This entry has not been verified. Confirm the contact route works before publishing it to members."}
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-title">Publication</div>
            <div className="action-help-text" style={{ marginTop: 0 }}>
              {resource.status === "Published"
                ? "Visible to members in the in-app directory."
                : "Not visible to members yet."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResourceDetailPage;
