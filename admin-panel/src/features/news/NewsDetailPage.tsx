/**
 * News story detail.
 *
 * The sources table is the important part of this screen. A story assembled
 * from other reporting is only as good as what it cites, so each source shows
 * its credibility rating rather than just a link.
 */

import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Page";
import env from "@/config/env";
import { newsStories } from "@/mocks/newsStories";

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-cell">
      <div className="info-cell-label">{label}</div>
      <div className="info-cell-value">{value}</div>
    </div>
  );
}

export function NewsDetailPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();

  const story = useMemo(() => newsStories.find((s) => s.id === storyId), [storyId]);

  useEffect(() => {
    document.title = story
      ? `${story.title} · ${env.appName} Admin`
      : `Not found · ${env.appName} Admin`;
  }, [story]);

  if (!story) {
    return (
      <Card>
        <div className="page-placeholder">
          <h2>Story not found</h2>
          <p>No story matches “{storyId}”.</p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" to="/news">
              Back to news
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
            title="Back to news"
            aria-label="Back to the news list"
            onClick={() => navigate("/news")}
          >
            ←
          </button>
          <div className="meta-chip-wrap">
            <strong>{story.id}</strong>
            <Badge tone={story.status === "Published" ? "published" : "draft"}>
              {story.status}
            </Badge>
            {story.verified ? <span className="verified-chip">✓ Verified</span> : null}
          </div>
        </div>

        <Button variant="primary" onClick={() => navigate(`/news/${story.id}/edit`)}>
          Edit Story
        </Button>
      </div>

      <h1 className="details-main-title">{story.title}</h1>

      <div className="details-grid">
        <div className="details-left">
          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Story Information</div>
            </div>
            <div className="content-info-grid">
              <InfoCell label="Category" value={story.category} />
              <InfoCell label="Scope" value={story.scope} />
              <InfoCell label="Location" value={story.location} />
              <InfoCell label="Language" value={story.languageLabel} />
              <InfoCell label="Published" value={story.publishedDate} />
              <InfoCell label="Length" value={`${story.chars.toLocaleString()} characters`} />
              <InfoCell label="SEO Indexed" value={story.seoIndexed ? "Yes" : "No"} />
              <InfoCell label="Daily Briefing" value={story.dailyBriefing ? "Included" : "No"} />
              <InfoCell
                label="Narration"
                value={
                  story.audioStatus === "Ready"
                    ? `${story.audioVoice} · ${story.audioDuration}`
                    : story.audioStatus
                }
              />
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Summary</div>
            </div>
            <div className="content-body-text">{story.summary}</div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Full Story</div>
            </div>
            <div className="content-body-text">
              {story.body.split("\n\n").map((paragraph, i) => (
                <p key={i} style={{ margin: "0 0 12px" }}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>

          <div className="detail-card">
            <div className="detail-card-head">
              <div className="card-section-label">Sources ({story.sources.length})</div>
            </div>
            <table className="mini">
              <thead>
                <tr>
                  <th scope="col" style={{ width: "34%" }}>
                    Source
                  </th>
                  <th scope="col" style={{ width: "46%" }}>
                    URL
                  </th>
                  <th scope="col" style={{ width: "20%" }}>
                    Credibility
                  </th>
                </tr>
              </thead>
              <tbody>
                {story.sources.map((source) => (
                  <tr key={source.url}>
                    <td>
                      <strong>{source.name}</strong>
                    </td>
                    <td className="cell-truncate">
                      <a
                        href={source.url}
                        target="_blank"
                        // noreferrer alongside noopener: the target page has no
                        // business knowing an admin console linked to it.
                        rel="noopener noreferrer"
                      >
                        {source.url}
                      </a>
                    </td>
                    <td>
                      <span className="badge approved">{source.credibility}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="details-right">
          <div className="action-card">
            <div className="action-card-title">Distribution</div>
            <div className="action-help-text" style={{ marginTop: 0 }}>
              {story.status === "Published"
                ? `Live in the ${story.scope.toLowerCase()} feed for ${story.location}.`
                : "Not yet visible to members."}
            </div>
          </div>

          <div className="action-card">
            <div className="action-card-title">Narration</div>
            <div className="action-help-text" style={{ marginTop: 0 }}>
              {story.audioStatus === "Ready"
                ? `Narrated by ${story.audioVoice}, running ${story.audioDuration}.`
                : "No narration has been generated for this story."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NewsDetailPage;
