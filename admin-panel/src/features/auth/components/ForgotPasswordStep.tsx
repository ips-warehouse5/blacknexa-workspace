/**
 * Account recovery: request a reset code, then set a new password.
 *
 * The request step always reports success, whatever the email was. Saying "no
 * such account" would turn this form into a way to find out which addresses are
 * administrators, which is worth more to an attacker than the small convenience
 * of a precise error is to anyone else.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { PasswordField, TextField } from "@/components/ui/Fields";
import {
  PASSWORD_RULES,
  forgotPasswordSchema,
  passwordStrength,
  resetPasswordSchema,
  type ForgotPasswordValues,
  type ResetPasswordValues,
} from "@/features/auth/auth.schemas";
import { recoveryApi } from "@/features/auth/recovery.api";
import { ApiError } from "@/types/api";

type Stage = "request" | "reset" | "done";

const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;

export function ForgotPasswordStep({ onBackToLogin }: { onBackToLogin: () => void }) {
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (stage === "done") {
    return <ResetCompletePanel onBackToLogin={onBackToLogin} />;
  }

  if (stage === "reset") {
    return (
      <ResetPanel
        email={email}
        onDone={() => setStage("done")}
        onBack={() => setStage("request")}
      />
    );
  }

  return (
    <RequestPanel
      error={error}
      setError={setError}
      onSent={(sentTo) => {
        setEmail(sentTo);
        setStage("reset");
      }}
      onBackToLogin={onBackToLogin}
    />
  );
}

// ── Stage 1: ask for a code ─────────────────────────────────────────────────

function RequestPanel({
  error,
  setError,
  onSent,
  onBackToLogin,
}: {
  error: string | null;
  setError: (value: string | null) => void;
  onSent: (email: string) => void;
  onBackToLogin: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await recoveryApi.requestReset(values.email);
      onSent(values.email);
    } catch (err) {
      // Only a genuine failure to *send* surfaces — an unknown address is
      // reported as success by the API, by design.
      setError(err instanceof ApiError ? err.message : "Could not send a reset code.");
    }
  });

  return (
    <div id="loginStepForgot">
      <div className="login-brand">
        <div className="login-brand-icon" aria-hidden="true">
          B
        </div>
        <div>
          <div className="login-brand-title">Account Recovery</div>
          <div
            style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, color: "#64748b" }}
          >
            RESET YOUR PASSWORD
          </div>
        </div>
      </div>

      <h2 className="login-title">Forgot Password</h2>
      <p className="login-subtitle">
        Enter your administrator email. If the account exists, we will send a reset code.
      </p>

      {error ? (
        <div className="login-error-alert" style={{ display: "block" }} role="alert">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Admin Email Address"
          type="email"
          placeholder="name@blacknexa.com"
          autoComplete="username"
          error={errors.email?.message}
          {...register("email")}
        />

        <button
          type="submit"
          className="login-submit-btn"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {isSubmitting ? "Sending…" : "Send Reset Code"}
        </button>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="auth-link-btn" onClick={onBackToLogin}>
            ← Back to Login
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Stage 2: set a new password ─────────────────────────────────────────────

function ResetPanel({
  email,
  onDone,
  onBack,
}: {
  email: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { code: "", password: "", confirmPassword: "" },
    mode: "onBlur",
  });

  // Watched so the rules checklist and meter update as the password is typed.
  const password = watch("password") ?? "";
  const strength = passwordStrength(password);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await recoveryApi.resetPassword({
        email,
        code: values.code,
        password: values.password,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset your password.");
    }
  });

  return (
    <div id="loginStepReset">
      <div className="login-brand">
        <div className="login-brand-icon" aria-hidden="true">
          B
        </div>
        <div>
          <div className="login-brand-title">Set a New Password</div>
          <div
            style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, color: "#64748b" }}
          >
            ACCOUNT RECOVERY
          </div>
        </div>
      </div>

      <h2 className="login-title">Choose a Password</h2>
      <p className="login-subtitle">
        Enter the code sent to <strong style={{ color: "var(--text)" }}>{email}</strong> and pick
        a new password.
      </p>

      {error ? (
        <div className="login-error-alert" style={{ display: "block" }} role="alert">
          {error}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        <TextField
          label="Reset Code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6-digit code"
          error={errors.code?.message}
          {...register("code")}
        />

        <PasswordField
          label="New Password"
          autoComplete="new-password"
          revealed={reveal}
          onToggleReveal={() => setReveal((v) => !v)}
          error={errors.password?.message}
          {...register("password")}
        />

        <div className="pw-strength-wrap">
          <div className="pw-strength-bar">
            <div
              className="pw-strength-fill"
              style={{ width: `${(strength / 4) * 100}%` }}
              data-strength={strength}
            />
          </div>
          <div className="pw-strength-label" aria-live="polite">
            {STRENGTH_LABELS[strength]}
          </div>
        </div>

        <ul className="pw-rules">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.label} className={met ? "ok" : ""}>
                <span className="tick" aria-hidden="true">
                  {met ? "✓" : "•"}
                </span>
                {rule.label}
              </li>
            );
          })}
        </ul>

        <PasswordField
          label="Confirm Password"
          autoComplete="new-password"
          revealed={reveal}
          onToggleReveal={() => setReveal((v) => !v)}
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />

        <button
          type="submit"
          className="login-submit-btn"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {isSubmitting ? "Updating…" : "Update Password"}
        </button>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="auth-link-btn" onClick={onBack}>
            ← Request a new code
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Stage 3: confirmation ───────────────────────────────────────────────────

function ResetCompletePanel({ onBackToLogin }: { onBackToLogin: () => void }) {
  return (
    <div className="auth-center">
      <div className="auth-success-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 className="login-title">Password Updated</h2>
      <p className="login-subtitle">
        Your password has been changed and every other session has been signed out. Sign in with
        your new password to continue.
      </p>
      <button type="button" className="login-submit-btn" onClick={onBackToLogin}>
        Back to Sign In
      </button>
    </div>
  );
}

export default ForgotPasswordStep;
