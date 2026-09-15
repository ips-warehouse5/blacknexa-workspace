/**
 * Step two of sign-in: the emailed one-time code.
 *
 * Two countdowns run here and they mean different things, so they are tracked
 * separately: the resend cooldown (how long before a new code may be asked for)
 * and the challenge lifetime (how long the current code stays valid). When the
 * second expires the inputs lock, because letting someone keep typing into a
 * dead challenge only burns attempts.
 */

import { useCallback, useEffect, useState } from "react";

import { MfaCodeInput } from "@/features/auth/components/MfaCodeInput";
import env from "@/config/env";
import { useAuthStore } from "@/stores/auth.store";
import { ApiError } from "@/types/api";
import type { MfaChallenge } from "@/types/auth";

/**
 * Counts down to zero from a starting value.
 *
 * Deliberately does not reset when `from` changes — the component is remounted
 * on a new challenge instead, which resets every clock and the typed code
 * together and cannot leave them disagreeing.
 */
function useCountdown(from: number): number {
  const [remaining, setRemaining] = useState(from);

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setInterval(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [remaining]);

  return remaining;
}

function MfaChallengeForm({ challenge }: { challenge: MfaChallenge }) {
  const verifyMfa = useAuthStore((s) => s.verifyMfa);
  const resendMfaCode = useAuthStore((s) => s.resendMfaCode);
  const cancelMfa = useAuthStore((s) => s.cancelMfa);

  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const [resendIn, setResendIn] = useState(challenge.resendAfterSeconds);
  const expiresIn = useCountdown(challenge.expiresInSeconds);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setInterval(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  const expired = expiresIn <= 0;

  const submit = useCallback(
    async (submittedCode: string) => {
      if (verifying || expired) return;
      setError(null);
      setVerifying(true);
      try {
        await verifyMfa(submittedCode);
        // On success the store flips to "authenticated" and the router takes
        // over — nothing further to do here.
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "That code could not be verified.");
        setCode("");
      } finally {
        setVerifying(false);
      }
    },
    [verifyMfa, verifying, expired],
  );

  const onResend = async () => {
    setResending(true);
    setError(null);
    try {
      await resendMfaCode();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a new code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div id="loginStepMfa">
      <div className="login-brand">
        <div className="login-brand-icon" aria-hidden="true">
          <svg
            style={{ width: 20, height: 20, stroke: "#fff", fill: "none", strokeWidth: 2.2 }}
            viewBox="0 0 24 24"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div>
          <div className="login-brand-title">
            Two-Factor Auth
            <span style={{ fontSize: 10, verticalAlign: "super" }}>MFA</span>
          </div>
          <div
            style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 1, color: "#64748b" }}
          >
            SECURITY VERIFICATION
          </div>
        </div>
      </div>

      <h2 className="login-title">Enter Security Code</h2>
      <p className="login-subtitle">
        A {challenge.codeLength}-digit security code was sent to{" "}
        <strong style={{ color: "var(--text)" }}>{challenge.email}</strong>.
      </p>

      {/*
        Development convenience: the API returns the generated code only when
        it is not running in production, so a local sign-in does not depend on
        a working mail transport.
      */}
      {env.isDev && challenge.devCode ? (
        <div className="login-info-alert" style={{ display: "block" }}>
          Development code: <strong>{challenge.devCode}</strong>
        </div>
      ) : null}

      {error ? (
        <div className="login-error-alert" style={{ display: "block" }} role="alert" id="mfa-error">
          {error}
        </div>
      ) : null}

      {expired && !error ? (
        <div className="login-warn-alert" style={{ display: "block" }} role="alert" id="mfa-error">
          That security code has expired. Request a new one to continue.
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <MfaCodeInput
          value={code}
          onChange={setCode}
          // Submitting on the last digit saves a keystroke people otherwise
          // hunt for after typing six numbers.
          onComplete={(value) => void submit(value)}
          length={challenge.codeLength}
          disabled={verifying || expired}
          invalid={Boolean(error)}
          {...(error || expired ? { describedBy: "mfa-error" } : {})}
        />

        <button
          type="submit"
          className="login-submit-btn"
          disabled={verifying || expired || code.length < challenge.codeLength}
          aria-busy={verifying}
        >
          {verifying ? <span className="btn-spinner" aria-hidden="true" /> : null}
          {verifying ? "Verifying…" : "Verify"}
        </button>

        <div className="mfa-help-text">
          Didn&apos;t receive the code?{" "}
          <button
            type="button"
            className="mfa-resend-btn"
            disabled={resendIn > 0 || resending}
            onClick={() => void onResend()}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : resending ? "Sending…" : "Resend code"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" className="auth-link-btn" onClick={cancelMfa}>
            ← Back to Login
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Remounts the form whenever a new challenge is issued.
 *
 * A resent code replaces the challenge, and with it both countdowns and the
 * digits already typed. Keying on the id discards the old instance rather than
 * unpicking its state field by field.
 */
export function MfaStep() {
  const challenge = useAuthStore((s) => s.challenge);
  if (!challenge) return null;
  return <MfaChallengeForm key={challenge.challengeId} challenge={challenge} />;
}

export default MfaStep;
