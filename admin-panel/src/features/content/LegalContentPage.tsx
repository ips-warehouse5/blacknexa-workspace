/**
 * Legal Content — the landing page for the platform's legal documents.
 *
 * A card per document, showing the version and effective date. Version is on
 * the card rather than inside because legal documents are re-accepted by
 * members when they change, so "which version is live" is the thing an operator
 * comes here to check.
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";

import { Card, PageHeader } from "@/components/ui/Page";
import env from "@/config/env";
import { FixtureNotice } from "@/features/misc/FixtureNotice";
import { legalDocuments } from "@/mocks/legalDocuments";

export function LegalContentPage() {
  useEffect(() => {
    document.title = `Legal Content · ${env.appName} Admin`;
  }, []);

  const documents = Object.entries(legalDocuments);

  return (
    <Card className="cm-page">
      <PageHeader
        title="Legal Content"
        description="Terms, privacy policy, and the other documents members accept. Changing one asks every member to re-accept it."
      />

      <FixtureNotice module="Legal content" />

      <div className="legal-card-grid">
        {documents.map(([type, document]) => (
          <Link key={type} to={`/content/legal/${type}`} className="cm-legal-card">
            <div className="cm-legal-card-title">{document.title}</div>
            <div className="cm-legal-card-meta">
              Version {document.version} · {document.updated}
            </div>
            <div className="cm-legal-card-sections">
              {document.sections.length} sections
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

export default LegalContentPage;
