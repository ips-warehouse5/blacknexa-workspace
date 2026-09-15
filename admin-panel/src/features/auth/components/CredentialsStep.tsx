/**
 * Step one of sign-in: email and password.
 *
 * The lockout countdown is rendered from the server's answer rather than
 * counted locally. The prototype tracked failures in a variable, which meant a
 * refresh cleared the lock; the API owns the attempt counter now, and this
 * screen only displays what it is told.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { PasswordField, TextField } from "@/components/ui/Fields";
import env from "@/config/env";
import { loginSchema, type LoginFormValues } from "@/features/auth/auth.schemas";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/types/api";
import { wasRemembered } from "@/lib/token-storage";

export interface CredentialsStepProps {
  onForgotPassword: () => void;
}

/** mm:ss for the lockout countdown. */
function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CredentialsStep({ onForgotPassword }: CredentialsStepProps) {
  const login = useAuthStore((s) => s.login);
  const expiryNotice = useAuthStore((s) => s.expiryNotice);

  const [formError, setFormError] = useState<string | null>(null);
  const [revealPassword, setRevealPassword] = useState(false);
  /** Seconds left on a server-imposed lockout, or 0 when not locked. */
  const [lockedFor, setLockedFor] = useState(0);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", remember: wasRemembered() },
    // Validate on blur rather than on every keystroke: flagging "not a valid
    // email" while someone is still typing the domain is just nagging.
    mode: "onBlur",
  });

  // Tick the lockout down locally. The value came from the server; this only
  // animates it so the operator can see when to try again.
  useEffect(() => {
    if (lockedFor <= 0) return;
    const timer = setInterval(() => setLockedFor((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [lockedFor]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login(values);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        // A lockout arrives as a 429 with Retry-After; the HTTP layer has
        // already turned that header into seconds.
        if (error.status === 429 && error.retryAfterSeconds !== undefined) {
          setLockedFor(error.retryAfterSeconds);
        }
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  });

  const locked = lockedFor > 0;

  return (
    <div id="loginStepCredentials">
      <div className="login-brand">
        <div className="login-brand-icon" aria-hidden="true">
          B
        </div>
        <div>
          <div className="login-brand-title">
            {env.appName}
            <span style={{ fontSize: 10, verticalAlign: "super" }}>TM</span>
          </div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 1,
              color: "#64748b",
            }}
          >
            ADMIN CONSOLE
          </div>
        </div>
      </div>

      <h2 className="login-title">Sign In</h2>
      <p className="login-subtitle">
        Enter your administrator credentials to access the console.
      </p>

      {expiryNotice ? (
        <div className="login-info-alert" style={{ display: "block" }}>
          {expiryNotice}
        </div>
      ) : null}

      {locked ? (
        <div className="login-warn-alert" style={{ display: "block" }} role="alert">
          <strong>Too many failed attempts.</strong> This account is temporarily locked. Try
          again in {formatCountdown(lockedFor)}.
        </div>
      ) : formError ? (
        // role="alert" so the failure is announced, not just shown.
        <div className="login-error-alert" style={{ display: "block" }} role="alert">
          {formError}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Admin Email Address"
          type="email"
          placeholder="name@blacknexa.com"
          autoComplete="username"
          error={errors.email?.message}
          disabled={locked}
          {...register("email")}
        />

        <PasswordField
          label="Password"
          placeholder="••••••••"
          autoComplete="current-password"
          revealed={revealPassword}
          onToggleReveal={() => setRevealPassword((v) => !v)}
          error={errors.password?.message}
          disabled={locked}
          {...register("password")}
        />

        <div className="login-row-between">
          <label className="remember-wrap" htmlFor="rememberDevice">
            <input id="rememberDevice" type="checkbox" {...register("remember")} />
            Remember this device
          </label>
          <button type="button" className="auth-link-btn" onClick={onForgotPassword}>
            Forgot password?
          </button>
        </div>

        <button
          type="submit"
          className="login-submit-btn"
          disabled={isSubmitting || locked}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {locked ? "Locked" : isSubmitting ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default CredentialsStep;
