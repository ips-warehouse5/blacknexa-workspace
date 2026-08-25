/**
 * Outbound email.
 *
 * Three templates, because the account flow needs exactly three: the A8
 * verification code, the A13/A14 reset code, and the D9 flag outcome.
 *
 * ── Two design constraints shape this file ──────────────────────────────────
 *
 * 1. **Send is fire-and-forget.** Screens A10 and A13 promise a response that is
 *    identical whether or not an account exists. If the caller awaited the SMTP
 *    round-trip, an existing address would take ~200 ms longer than an unknown
 *    one and the promise would be false — the timing *is* the disclosure. So the
 *    send is dispatched through `runBackground` and the endpoint returns
 *    immediately, on both paths.
 *
 * 2. **A code never appears in a log.** `outbound_emails` records that a message
 *    was sent, to whom, and whether it succeeded — never its body. A log line
 *    containing a live verification code is a credential in a log aggregator.
 *
 * In development with no SMTP host configured, messages are written to the log
 * instead of sent, so the whole sign-up flow is walkable without a mail provider.
 * That fallback is refused in production: `env.config.ts` requires `SMTP_HOST`
 * when the reports surface is enabled.
 */

import nodemailer, { type Transporter } from "nodemailer";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";

/** A rendered message, ready for the transport. */
interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Shared visual shell. Inline styles only — every mail client strips <style>. */
function wrap(heading: string, bodyHtml: string, footnote?: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;padding:0;background:#F1F5FA;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5FA;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:16px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
        <tr><td>
          <div style="font:600 11px/1 -apple-system,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#0A7CFF;">BlackNexa</div>
          <h1 style="margin:18px 0 0;font:600 24px/1.2 Georgia,'Times New Roman',serif;color:#0E1116;">${heading}</h1>
          ${bodyHtml}
          ${
            footnote
              ? `<p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #E6ECF4;font:400 12px/1.6 -apple-system,sans-serif;color:#7A8593;">${footnote}</p>`
              : ""
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Render the code as spaced digits so it is easy to read off a lock screen. */
function codeBlock(code: string): string {
  const spaced = code.split("").join(" ");
  return `<div style="margin:24px 0 0;padding:20px;background:#F5F7FA;border-radius:12px;text-align:center;font:600 30px/1 'SF Mono',Menlo,Consolas,monospace;letter-spacing:.18em;color:#0E1116;">${spaced}</div>`;
}

function minutesFrom(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

class MailerService {
  private transporter: Transporter | null = null;

  get isEnabled(): boolean {
    return env.mail.enabled;
  }

  /** Lazily build the transport so a mail-less development boot costs nothing. */
  private getTransporter(): Transporter | null {
    if (!this.isEnabled) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.mail.host,
        port: env.mail.port,
        secure: env.mail.secure,
        auth: env.mail.user ? { user: env.mail.user, pass: env.mail.password } : undefined,
      });
    }
    return this.transporter;
  }

  /**
   * Verify the transport at boot.
   *
   * Better to learn that SMTP credentials are wrong on deploy than at a user's
   * first sign-up. Failure is logged, not thrown: a mail outage should not stop
   * the API from serving reads.
   */
  async verifyConnection(): Promise<boolean> {
    const transporter = this.getTransporter();
    if (!transporter) {
      logger.warn(
        "[mail] no SMTP host configured — verification and reset codes will be written to the log instead of sent",
      );
      return false;
    }
    try {
      await transporter.verify();
      logger.info("[mail] SMTP transport verified", { host: env.mail.host });
      return true;
    } catch (err) {
      logger.error("[mail] SMTP verification failed", {
        host: env.mail.host,
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Deliver one message.
   *
   * Never throws: every caller is on a path whose response must not depend on the
   * mail provider. The boolean is for the send log, not for control flow.
   */
  private async deliver(message: Message): Promise<boolean> {
    const transporter = this.getTransporter();

    if (!transporter) {
      // Development fallback. The body is logged deliberately here — this branch
      // is unreachable in production, and without it nobody can complete sign-up
      // on a laptop.
      logger.warn("[mail] not configured — message not sent", {
        to: message.to,
        subject: message.subject,
        preview: message.text,
      });
      return false;
    }

    try {
      await transporter.sendMail({
        from: env.mail.from,
        replyTo: env.mail.replyTo || undefined,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      // Recipient and subject only. The body carries a live code.
      logger.info("[mail] sent", { to: message.to, subject: message.subject });
      return true;
    } catch (err) {
      logger.error("[mail] delivery failed", {
        to: message.to,
        subject: message.subject,
        message: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  // ── Templates ─────────────────────────────────────────────────────────────

  /** Screen A8 — the six-digit code that finishes sign-up. */
  async sendVerificationCode(to: string, code: string): Promise<boolean> {
    const minutes = minutesFrom(env.otp.ttlSeconds);
    return this.deliver({
      to,
      subject: `${code} is your BlackNexa verification code`,
      text: [
        `Your BlackNexa verification code is ${code}.`,
        ``,
        `It expires in ${minutes} minutes and can be used once.`,
        `If you did not create an account, you can ignore this email.`,
      ].join("\n"),
      html: wrap(
        "Confirm your email",
        `<p style="margin:12px 0 0;font:400 15px/1.6 -apple-system,sans-serif;color:#55606E;">Enter this code to finish setting up your account.</p>
         ${codeBlock(code)}
         <p style="margin:20px 0 0;font:400 14px/1.6 -apple-system,sans-serif;color:#55606E;">The code expires in ${minutes} minutes and works once.</p>`,
        "If you did not create a BlackNexa account, you can ignore this email — nothing has been set up.",
      ),
    });
  }

  /**
   * Screens A13 / A14 — the reset code.
   *
   * Sent only when the address actually has an account, but the endpoint responds
   * identically either way. The recipient is told plainly that a reset will end
   * their other sessions, because A15 states that side effect and a person should
   * not first learn it after the fact.
   */
  async sendPasswordResetCode(to: string, code: string): Promise<boolean> {
    const minutes = minutesFrom(env.otp.ttlSeconds);
    return this.deliver({
      to,
      subject: `${code} is your BlackNexa password reset code`,
      text: [
        `Your BlackNexa password reset code is ${code}.`,
        ``,
        `It expires in ${minutes} minutes and can be used once.`,
        `Changing your password signs you out on every other device.`,
        ``,
        `If you did not ask to reset your password, you can ignore this email — your password has not changed.`,
      ].join("\n"),
      html: wrap(
        "Reset your password",
        `<p style="margin:12px 0 0;font:400 15px/1.6 -apple-system,sans-serif;color:#55606E;">Enter this code in the app, then choose a new password.</p>
         ${codeBlock(code)}
         <p style="margin:20px 0 0;font:400 14px/1.6 -apple-system,sans-serif;color:#55606E;">The code expires in ${minutes} minutes. Changing your password signs you out on every other device.</p>`,
        "If you did not ask for this, you can ignore the email — your password has not changed.",
      ),
    });
  }

  /** Screen D9 — "You will hear back: By email". */
  async sendFlagOutcome(
    to: string,
    flagRef: string,
    outcome: string,
    detail: string,
  ): Promise<boolean> {
    return this.deliver({
      to,
      subject: `Your report ${flagRef} has been reviewed`,
      text: [`Flag ${flagRef}`, ``, `Outcome: ${outcome}`, ``, detail].join("\n"),
      html: wrap(
        "A moderator has looked",
        `<p style="margin:12px 0 0;font:400 15px/1.6 -apple-system,sans-serif;color:#55606E;">Reference <strong style="color:#0E1116;">${flagRef}</strong></p>
         <div style="margin:20px 0 0;padding:16px;background:#F5F7FA;border-radius:12px;">
           <div style="font:600 11px/1 -apple-system,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#7A8593;">Outcome</div>
           <div style="margin-top:8px;font:600 16px/1.4 -apple-system,sans-serif;color:#0E1116;">${outcome}</div>
         </div>
         <p style="margin:20px 0 0;font:400 14px/1.6 -apple-system,sans-serif;color:#55606E;">${detail}</p>`,
        "The person who filed the report was told nothing about you.",
      ),
    });
  }

  /**
   * The last thing we ever send to this address.
   *
   * Sent after the delete has committed, and it says what actually happened to the
   * reports rather than a bare "your account is closed" — the disposition was a
   * real choice and this is the only record of it the person keeps.
   */
  async sendAccountDeleted(
    to: string,
    disposition: "sever" | "erase",
    counts: { severed: number; erased: number },
  ): Promise<boolean> {
    const kept = disposition === "sever";
    const total = kept ? counts.severed : counts.erased;
    const reports =
      total === 0
        ? "You had not filed any reports."
        : kept
          ? `${total} ${total === 1 ? "report stays" : "reports stay"} in the community feed as anonymous record. The link to you has been cut and cannot be restored — not by you, and not by us.`
          : `${total} ${total === 1 ? "report has" : "reports have"} been removed from the feed. The sealed files are destroyed after ${env.reports.evidenceRetentionDays} days.`;

    return this.deliver({
      to,
      subject: "Your BlackNexa account has been deleted",
      text: [
        `Your BlackNexa account has been deleted.`,
        ``,
        reports,
        ``,
        `Your comments, the reports you stood with and every device you were signed in on are gone.`,
        `Nothing further is needed from you, and this address is not on any list.`,
      ].join("\n"),
      html: wrap(
        "Your account is gone",
        `<p style="margin:12px 0 0;font:400 15px/1.6 -apple-system,sans-serif;color:#55606E;">${reports}</p>
         <p style="margin:16px 0 0;font:400 15px/1.6 -apple-system,sans-serif;color:#55606E;">Your comments, the reports you stood with and every device you were signed in on are gone.</p>`,
        "Nothing further is needed from you, and this address is not on any list.",
      ),
    });
  }
}

export const mailerService = new MailerService();
export default mailerService;
