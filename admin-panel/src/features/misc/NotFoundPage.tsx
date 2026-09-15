/**
 * Shown for a URL inside the console that matches no route.
 *
 * Rendered inside the app shell rather than as a bare page, so the sidebar is
 * still there and the operator can carry on in one click.
 */

import { Link } from "react-router-dom";

import { Card } from "@/components/ui/Page";

export function NotFoundPage() {
  return (
    <Card>
      <div className="page-placeholder">
        <h2>Page not found</h2>
        <p>That address does not match anything in the console.</p>
        <div style={{ marginTop: 16 }}>
          <Link className="btn primary" to="/dashboard">
            Back to dashboard
          </Link>
        </div>
      </div>
    </Card>
  );
}

export default NotFoundPage;
