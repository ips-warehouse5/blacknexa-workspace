/**
 * Content Moderation endpoints — `/api/v1/admin/moderation` (plan §8.1,
 * contract `blacknexa-backend/docs/ADMIN_MODERATION_API.md` §2).
 *
 * The queue is paged, filtered and sorted server-side, and its tab counts come
 * from a separate summary call: the tabs describe every open case, and page one
 * of a filtered list is not that. Decisions are sub-resources of the case
 * (`/cases/:id/approve`, `/reject`, …) because the server resolves the case, the
 * target and every open flag on it in one transaction — the console never
 * sequences those itself.
 *
 * Optional note fields are omitted rather than sent empty. The API treats a
 * blank note as absent, but leaving the key out means the request says exactly
 * what the moderator wrote and nothing else.
 */

import { apiGet, apiGetPage, apiPost } from "@/lib/http";
import type { Paginated } from "@/types/api";
import type {
  ApproveCaseInput,
  BanMemberInput,
  CaseDecisionResult,
  CaseDetail,
  CaseListItem,
  CaseListParams,
  CaseSummary,
  EvidenceLink,
  EvidenceRejectResult,
  MemberStatusResult,
  ModerationStats,
  RejectCaseInput,
  RejectEvidenceInput,
  RerunResponse,
  UnbanMemberInput,
} from "@/features/moderation/moderation.types";

const BASE = "/admin/moderation";

/**
 * Turn queue state into query parameters.
 *
 * `tab=all` and `state=open` are the server defaults, but they are sent anyway:
 * the request then reads the same in the network panel as the screen does, and
 * a future change of server default cannot silently change what a tab shows.
 */
function toQuery(params: CaseListParams): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
    tab: params.tab,
    state: params.state,
    sort: params.sort,
  };
  if (params.search.trim()) query.search = params.search.trim();
  return query;
}

/** Drop blank optional strings so an untouched textarea sends nothing. */
function note(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Build a body from optional fields without writing `undefined` values into it. */
function compact<T extends object>(body: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export const moderationApi = {
  /** One page of the queue. */
  async listCases(params: CaseListParams): Promise<Paginated<CaseListItem>> {
    const { items, pagination } = await apiGetPage<CaseListItem>(`${BASE}/cases`, {
      params: toQuery(params),
    });
    return {
      items,
      // A server that omits the block still yields a usable single page rather
      // than crashing the footer on a missing `total`.
      pagination: pagination ?? {
        page: params.page,
        limit: params.limit,
        total: items.length,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
    };
  },

  /** Open-case counts per tab, plus urgent and safety totals. */
  summary(): Promise<CaseSummary> {
    return apiGet<CaseSummary>(`${BASE}/cases/summary`);
  },

  /** Everything needed to decide a case once — open or resolved. */
  detail(caseId: string): Promise<CaseDetail> {
    return apiGet<CaseDetail>(`${BASE}/cases/${caseId}`);
  },

  /**
   * A short-lived link to one sealed file on the case's report.
   *
   * Asked for on each "View" rather than cached: the URL is presigned for a few
   * minutes, and a cached one would be dead by the time a moderator comes back
   * to the tab.
   */
  evidenceLink(caseId: string, evidenceId: string): Promise<EvidenceLink> {
    return apiGet<EvidenceLink>(`${BASE}/cases/${caseId}/evidence/${evidenceId}`);
  },

  /**
   * Approve & Publish · Keep Published · Keep Comment.
   *
   * `evidenceIds` names the files the approval releases (review Q6). An empty
   * list is left out rather than sent: the contract reads "absent" and "none"
   * the same way, and leaving it out keeps the body to what was decided.
   */
  approve(caseId: string, input: ApproveCaseInput): Promise<CaseDecisionResult> {
    return apiPost<CaseDecisionResult>(
      `${BASE}/cases/${caseId}/approve`,
      compact({
        internalNote: note(input.internalNote),
        contentVersion: input.contentVersion,
        evidenceIds:
          input.evidenceIds && input.evidenceIds.length > 0 ? input.evidenceIds : undefined,
      }),
    );
  },

  /** Reject · Reject & Take Down · Remove Comment. */
  reject(caseId: string, input: RejectCaseInput): Promise<CaseDecisionResult> {
    return apiPost<CaseDecisionResult>(
      `${BASE}/cases/${caseId}/reject`,
      compact({
        reasonCode: input.reasonCode,
        publicNote: note(input.publicNote),
        internalNote: note(input.internalNote),
        contentVersion: input.contentVersion,
      }),
    );
  },

  /** Hide one file from members permanently; the report and the case are unchanged. */
  rejectEvidence(
    caseId: string,
    evidenceId: string,
    input: RejectEvidenceInput,
  ): Promise<EvidenceRejectResult> {
    return apiPost<EvidenceRejectResult>(
      `${BASE}/cases/${caseId}/evidence/${evidenceId}/reject`,
      compact({ reasonCode: input.reasonCode, internalNote: note(input.internalNote) }),
    );
  },

  /** Held → pending plus a queued AI run; the case stays open until the run answers. */
  rerun(caseId: string): Promise<RerunResponse> {
    return apiPost<RerunResponse>(`${BASE}/cases/${caseId}/rerun`);
  },

  /** `memberId` is the app-user id (`CaseAuthorView.id`), not an operator id. */
  ban(memberId: string, input: BanMemberInput): Promise<MemberStatusResult> {
    return apiPost<MemberStatusResult>(
      `${BASE}/members/${memberId}/ban`,
      compact({ reasonCode: input.reasonCode, note: note(input.note), caseId: input.caseId }),
    );
  },

  unban(memberId: string, input: UnbanMemberInput): Promise<MemberStatusResult> {
    return apiPost<MemberStatusResult>(
      `${BASE}/members/${memberId}/unban`,
      compact({ note: note(input.note), caseId: input.caseId }),
    );
  },

  /** Queue health — read by the dashboard as well as this module. */
  stats(): Promise<ModerationStats> {
    return apiGet<ModerationStats>(`${BASE}/stats`);
  },
};

export default moderationApi;
