/**
 * The sign-in route.
 *
 * One route holds every step — credentials, second factor, recovery — because
 * they are one task. Giving the MFA step its own URL would let it be opened
 * directly with no challenge in progress, and would make the browser's back
 * button mean something confusing halfway through signing in.
 */

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { CredentialsStep } from "@/features/auth/components/CredentialsStep";
import { ForgotPasswordStep } from "@/features/auth/components/ForgotPasswordStep";
import { MfaStep } from "@/features/auth/components/MfaStep";
import env from "@/config/env";
import { useAuthStore } from "@/stores/auth.store";

/** Where the user was going before they were bounced here, if anywhere. */
interface LocationState {
  from?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const status = useAuthStore((s) => s.status);
  const clearExpiryNotice = useAuthStore((s) => s.clearExpiryNotice);

  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    document.title = `Sign in · ${env.appName} Admin`;
  }, []);

  // Once signed in, go on to wherever they were headed.
  useEffect(() => {
    if (status !== "authenticated") return;
    const from = (location.state as LocationState | null)?.from;
    navigate(from && from !== "/login" ? from : "/dashboard", { replace: true });
  }, [status, location.state, navigate]);

  return (
    <div className="auth-page">
      <div id="authScreen" style={{ display: "flex" }}>
        <div className="login-container">
          {recovering ? (
            <ForgotPasswordStep
              onBackToLogin={() => {
                setRecovering(false);
                clearExpiryNotice();
              }}
            />
          ) : status === "awaitingMfa" ? (
            <MfaStep />
          ) : (
            <CredentialsStep onForgotPassword={() => setRecovering(true)} />
          )}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
