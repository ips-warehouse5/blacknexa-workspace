/**
 * Catches render errors so a bug in one screen does not blank the console.
 *
 * A class component because error boundaries have no hook equivalent — this is
 * the one place React still requires one.
 *
 * The error text is shown in development and withheld in production. A stack
 * trace helps whoever is building; to an operator it is noise that can leak
 * internal names, and what they need is a way to carry on.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import env from "@/config/env";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Left as console output deliberately: wiring this to a reporting service
    // is a deployment decision, and this is the single place it would attach.
    console.error("[admin] render error", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-error" role="alert">
        <div className="denied-card">
          <div className="denied-title">Something went wrong</div>
          <p className="denied-text">
            This screen could not be displayed. Reloading usually clears it — if it keeps
            happening, let the platform team know what you were doing.
          </p>

          {env.isDev ? (
            <pre className="app-error-detail">{error.message}</pre>
          ) : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
            <button
              type="button"
              className="btn outline"
              // Clearing the error re-renders the subtree; if the cause was
              // transient, this recovers without losing the whole session.
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => window.location.assign("/dashboard")}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
