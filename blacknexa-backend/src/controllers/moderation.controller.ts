/**
 * Moderator surface — `/api/v1/admin/moderation`.
 *
 * Guarded by the existing `adminAuthGuard` plus a role check, so this adds no new
 * authentication surface: the operator accounts and their tokens already exist.
 *
 * Two endpoints render HTML rather than JSON. That is deliberate and bounded — the
 * plan calls for "the smallest usable surface on top of a properly built API"
 * rather than an admin SPA, and the backend already server-renders `/news/:slug`
 * through `seo.controller.ts`, so the pattern is established. When someone wants a
 * real console, every number on these pages already has a JSON endpoint behind it.
 */

import type { Request, Response } from "express";
import moderationQueueService from "@/services/moderation_queue.service";
import reportMaintenanceService from "@/services/report_maintenance.service";
import { responseData } from "@/utils/response.util";
import responseMessage from "@/utils/response_message.util";
import {
  validatedBody,
  validatedParams,
  validatedQuery,
} from "@/middlewares/validate.middleware";
import type { ModerationOutcome, ReportStatus } from "@/types/report.interface";

/** Escape everything interpolated into the internal pages. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

class ModerationController {
  // ── JSON ──────────────────────────────────────────────────────────────────

  /** `GET /admin/moderation/reports` */
  async queue(req: Request, res: Response): Promise<void> {
    const query = validatedQuery<{
      status?: ReportStatus;
      urgent?: boolean;
      flagged?: boolean;
      cursor?: string;
      limit?: number;
    }>(req);

    const result = await moderationQueueService.queue(query);
    responseData({ res, message: responseMessage("success", "list", "Report"), result });
  }

  /** `GET /admin/moderation/reports/:id` — identity visible, by design. */
  async detail(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const result = await moderationQueueService.detail(id);
    responseData({ res, message: responseMessage("success", "fetch", "Report"), result });
  }

  /** `GET /admin/moderation/reports/:id/evidence/:evidenceId` */
  async evidenceUrl(req: Request, res: Response): Promise<void> {
    const { id, evidenceId } = validatedParams<{ id: string; evidenceId: string }>(req);
    const url = await moderationQueueService.evidenceUrl(id, evidenceId);
    responseData({
      res,
      status: url ? 200 : 404,
      message: url ? "Link ready." : responseMessage("notFound", undefined, "File"),
      result: url ? { url } : null,
    });
  }

  /** `POST /admin/moderation/reports/:id/status` — drives the state machine. */
  async decide(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ status: ModerationOutcome; note?: string }>(req);

    await moderationQueueService.decide(
      id,
      body.status,
      { id: req.user!.id, email: req.user!.email },
      body.note,
    );
    responseData({ res, message: "Decision recorded.", result: { reportId: id, status: body.status } });
  }

  /** `POST /admin/moderation/flags/:id/resolve` */
  async resolveFlag(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    const body = validatedBody<{ resolution: string; outcome: "resolved" | "dismissed" }>(req);

    await moderationQueueService.resolveFlag(id, body.resolution, body.outcome, {
      id: req.user!.id,
    });
    responseData({ res, message: "Flag resolved.", result: null });
  }

  /** `POST /admin/moderation/comments/:id/hide` */
  async hideComment(req: Request, res: Response): Promise<void> {
    const { id } = validatedParams<{ id: string }>(req);
    await moderationQueueService.hideComment(id);
    responseData({ res, message: "Comment hidden.", result: null });
  }

  /** `POST /admin/moderation/broadcast` — A11's urgent type. */
  async broadcast(req: Request, res: Response): Promise<void> {
    const body = validatedBody<{ area: string; title: string; body: string }>(req);
    const result = await moderationQueueService.broadcast(body.area, body.title, body.body);
    responseData({ res, message: "Broadcast sent.", result });
  }

  /**
   * `POST /admin/moderation/maintenance` — run the nightly job now.
   *
   * The job is on a cron, but a retention promise nobody can trigger on demand is a
   * retention promise nobody can verify. This runs the same code path the schedule
   * does and returns what it did, so "files are destroyed after 30 days" is a claim
   * an operator can check rather than take on trust.
   */
  async runMaintenance(_req: Request, res: Response): Promise<void> {
    const result = await reportMaintenanceService.run();
    responseData({ res, message: "Maintenance run complete.", result });
  }

  /** `GET /admin/moderation/stats` — the SLA, measurable. */
  async stats(_req: Request, res: Response): Promise<void> {
    const result = await moderationQueueService.stats();
    responseData({ res, message: responseMessage("success", "fetch", "Stats"), result });
  }

  // ── The thin internal page ────────────────────────────────────────────────

  /**
   * `GET /admin/moderation` — the queue as HTML.
   *
   * One page, one table, four buttons per row. It exists so a moderator can work
   * today without waiting for a console, and it deliberately does not grow: the
   * JSON above is the real interface.
   */
  async queuePage(req: Request, res: Response): Promise<void> {
    const [queue, stats] = await Promise.all([
      moderationQueueService.queue({ limit: 50 }),
      moderationQueueService.stats(),
    ]);

    const rows = queue.items
      .map(
        (row) => `
        <tr${row.slaBreached ? ' class="breach"' : ""}>
          <td><code>${esc(row.caseRef)}</code></td>
          <td>${esc(row.title)}</td>
          <td>${esc(row.category)}</td>
          <td>${row.urgent ? '<span class="urgent">URGENT</span>' : ""}</td>
          <td>${esc(row.status)}</td>
          <td class="num">${row.evidenceCount}</td>
          <td class="num">${row.openFlags > 0 ? `<span class="flagged">${row.openFlags}</span>` : "0"}</td>
          <td class="num">${row.waitingMinutes}m</td>
          <td class="actions">
            <button data-id="${esc(row.id)}" data-status="under_review">Reviewing</button>
            <button data-id="${esc(row.id)}" data-status="verified" class="ok">Verify</button>
            <button data-id="${esc(row.id)}" data-status="dismissed" class="bad">Dismiss</button>
          </td>
        </tr>`,
      )
      .join("");

    res.status(200).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Moderation queue</title>
<style>
:root{--bg:#fff;--s1:#f1f5fa;--s3:#f5f7fa;--line:#d5dce4;--t0:#0e1116;--t2:#55606e;--t3:#7a8593;--acc:#0a7cff;--ok:#1a8f4c;--bad:#c2352e;--warn:#b26a00}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--t0);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,sans-serif}
header{padding:24px 28px;border-bottom:1px solid var(--line)}
h1{margin:0;font:600 22px/1.2 Georgia,serif}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
.stat{background:var(--s3);border-radius:12px;padding:12px 16px;min-width:120px}
.stat b{display:block;font-size:22px;font-weight:600}
.stat span{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--t3)}
.stat.alert b{color:var(--bad)}
main{padding:20px 28px 60px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:900px}
th{text-align:left;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--t3);background:var(--s1);padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px;border-bottom:1px solid var(--s1);vertical-align:top}
tr.breach td{background:#fdf3f2}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
code{font:12px ui-monospace,Menlo,monospace;background:var(--s1);padding:2px 5px;border-radius:4px}
.urgent{font:600 10px/1 sans-serif;letter-spacing:.06em;color:#fff;background:var(--bad);padding:4px 6px;border-radius:4px}
.flagged{color:var(--warn);font-weight:600}
.actions{white-space:nowrap}
button{font:500 12px sans-serif;padding:7px 11px;margin-right:5px;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer}
button:hover{background:var(--s1)}
button.ok{border-color:var(--ok);color:var(--ok)}
button.bad{border-color:var(--bad);color:var(--bad)}
.empty{padding:48px 0;text-align:center;color:var(--t2)}
</style></head><body>
<header>
  <h1>Moderation queue</h1>
  <div class="stats">
    <div class="stat"><b>${stats.open}</b><span>Open</span></div>
    <div class="stat"><b>${stats.urgentOpen}</b><span>Urgent open</span></div>
    <div class="stat${stats.urgentBreached > 0 ? " alert" : ""}"><b>${stats.urgentBreached}</b><span>Past ${stats.slaMinutes}m SLA</span></div>
    <div class="stat"><b>${stats.openFlags}</b><span>Open flags</span></div>
    <div class="stat"><b>${stats.oldestWaitingMinutes}m</b><span>Longest wait</span></div>
  </div>
</header>
<main>
${
  queue.items.length === 0
    ? '<p class="empty">Nothing waiting. The queue is clear.</p>'
    : `<table><thead><tr>
        <th>Ref</th><th>Title</th><th>Category</th><th></th><th>Status</th>
        <th class="num">Files</th><th class="num">Flags</th><th class="num">Waiting</th><th>Decision</th>
      </tr></thead><tbody>${rows}</tbody></table>`
}
</main>
<script>
// The page posts to the same JSON API a console would use. The bearer token is
// pasted once per session rather than stored: this is an internal tool, and a
// long-lived operator token in localStorage is a worse trade than one prompt.
var token = sessionStorage.getItem('bn_admin_token');
if (!token) {
  token = window.prompt('Paste your admin access token');
  if (token) sessionStorage.setItem('bn_admin_token', token);
}
document.querySelectorAll('button[data-id]').forEach(function (el) {
  el.addEventListener('click', function () {
    var note = window.prompt('Note for the timeline (optional)') || undefined;
    fetch('/api/v1/admin/moderation/reports/' + el.dataset.id + '/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ status: el.dataset.status, note: note })
    }).then(function (r) {
      if (r.ok) { window.location.reload(); return; }
      return r.json().then(function (b) { window.alert(b.error || b.message || 'That did not work.'); });
    }).catch(function () { window.alert('Network error.'); });
  });
});
</script>
</body></html>`);
  }
}

export const moderationController = new ModerationController();
export default moderationController;
