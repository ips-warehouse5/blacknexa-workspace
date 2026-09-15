/**
 * Read one Rights & Guidance article as members see it.
 */

import { useEffect, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Page";
import env from "@/config/env";
import { educationalArticles } from "@/mocks/educationalArticles";

export function ArticleDetailPage() {
  const { articleId } = useParams<{ articleId: string }>();
  const navigate = useNavigate();

  const article = useMemo(
    () => educationalArticles.find((a) => a.id === articleId),
    [articleId],
  );

  useEffect(() => {
    document.title = article
      ? `${article.title} · ${env.appName} Admin`
      : `Not found · ${env.appName} Admin`;
  }, [article]);

  if (!article) {
    return (
      <Card>
        <div className="page-placeholder">
          <h2>Article not found</h2>
          <p>No article matches “{articleId}”.</p>
          <div style={{ marginTop: 16 }}>
            <Link className="btn primary" to="/content/articles">
              Back to articles
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="details-page cm-page">
      <div className="details-top-bar" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            className="back-btn-pill"
            title="Back to articles"
            aria-label="Back to the article list"
            onClick={() => navigate("/content/articles")}
          >
            ←
          </button>
          <div className="meta-chip-wrap">
            <strong>{article.id}</strong>
            <Badge tone={article.status === "Published" ? "published" : "draft"}>
              {article.status}
            </Badge>
            <span>·</span>
            <span>{article.category}</span>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={() => navigate(`/content/articles/${article.id}/edit`)}
        >
          Edit Article
        </Button>
      </div>

      <h1 className="details-main-title">{article.title}</h1>

      <div className="detail-card">
        <div className="detail-card-head">
          <div className="card-section-label">Article</div>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Updated {article.updated}</span>
        </div>
        <div className="content-body-text article-body">
          {article.content.split("\n\n").map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ArticleDetailPage;
