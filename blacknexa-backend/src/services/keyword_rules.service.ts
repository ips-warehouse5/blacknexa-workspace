/**
 * Keyword rules — the cached rule set the pipeline matches, and the CRUD
 * primitives the admin console's *Keyword Rules* screen will call.
 *
 * docs/INCIDENT_MODULE_PLAN.md §4.5, §5.3 step 3, §8.1 and D9. The matching
 * itself is pure and lives in `moderation_keyword_matcher.ts`; this file owns
 * everything that touches the `keyword_rules` table.
 *
 * ── The cache, keyed by max(updated_on) (§8.1) ────────────────────────────
 * Every moderation run needs the enabled rules for its target type. Loading
 * and compiling them per run would be wasteful, and caching them for a fixed
 * time would mean an admin who disables a noisy rule watches it keep firing for
 * minutes. So the cache is keyed by the table's own change marker:
 *
 *     max(updated_on), max(deleted_on), count(*)     — over every row, deleted too
 *
 * Any create, edit, enable/disable or soft delete moves one of the three, on
 * any replica. The key is re-read at most every two seconds (a single index-
 * free aggregate over a table of tens of rows), and a write made through this
 * service drops the local cache at once. `detected_count` updates deliberately
 * do *not* touch `updated_on` — they happen on almost every run, and counting a
 * detection must not invalidate the rules that produced it.
 *
 * ── The CRUD primitives (Phase 2 calls these) ─────────────────────────────
 * `listRules`, `createRule`, `updateRule`, `softDeleteRule`. Each write runs in
 * one transaction with its `keyword_rule.*` audit row, validates terms with the
 * shared `validateRuleTerms` (§4.5: 1–50 terms of 2–80 characters, trailing
 * `*` as a prefix), and enforces name uniqueness among *live* rows, case-
 * insensitively — the check gives a clean 409, and the partial unique index
 * `uq_keyword_rules_name_live` settles a race between two admins. Errors are
 * `HttpError`s with client-safe messages, so the controller only forwards them.
 */

import { Op, QueryTypes, UniqueConstraintError, type Transaction, type WhereOptions } from "sequelize";
import sequelize from "@/config/database.config";
import logger from "@/utils/logger.util";
import { nowIso } from "@/models/model_options";
import { KeywordRule } from "@/models/moderation.model";
import { HttpError, badRequest, notFound } from "@/middlewares/error.middleware";
import { auditService } from "@/services/audit.service";
import {
  compileRule,
  validateRuleTerms,
  type CompiledRule,
} from "@/services/moderation_keyword_matcher";
import {
  ALL_KEYWORD_ACTIONS,
  ALL_KEYWORD_APPLIES_TO,
  ADMIN_TAB_LABELS,
  isPolicyCategory,
  type KeywordAction,
  type KeywordAppliesTo,
  type KeywordHit,
  type KeywordRuleKind,
  type ModerationTargetType,
  type PolicyCategory,
} from "@/types/moderation.interface";

/** How often the cache key is re-read. Other replicas see a change within this. */
const KEY_CHECK_INTERVAL_MS = 2_000;

const NAME_MIN = 2;
const NAME_MAX = 80;
const LIST_LIMIT_MAX = 100;

/** The console's view of a rule (camelCase wire fields). */
export interface KeywordRuleView {
  id: string;
  name: string;
  category: PolicyCategory;
  categoryLabel: string;
  terms: string[];
  action: KeywordAction;
  kind: KeywordRuleKind;
  appliesTo: KeywordAppliesTo;
  enabled: boolean;
  detectedCount: number;
  lastDetectedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ListRulesQuery {
  page?: number;
  limit?: number;
  /** Matches the rule name or any of its terms, case-insensitively. */
  search?: string;
  action?: KeywordAction;
  enabled?: boolean;
  category?: PolicyCategory;
  appliesTo?: KeywordAppliesTo;
}

export interface ListRulesResult {
  items: KeywordRuleView[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateRuleInput {
  name: string;
  category: PolicyCategory;
  terms: unknown;
  action?: KeywordAction;
  appliesTo?: KeywordAppliesTo;
  enabled?: boolean;
}

export interface UpdateRuleInput {
  name?: string;
  category?: PolicyCategory;
  terms?: unknown;
  action?: KeywordAction;
  appliesTo?: KeywordAppliesTo;
  enabled?: boolean;
}

/** Who is changing the rules, for `created_by` / `updated_by` and the audit row. */
export interface RuleActor {
  adminId: string;
  ip?: string | null;
}

interface RuleCache {
  key: string;
  checkedAt: number;
  byTarget: Record<ModerationTargetType, CompiledRule[]>;
}

function toView(rule: KeywordRule): KeywordRuleView {
  const category = isPolicyCategory(rule.category) ? rule.category : "other";
  return {
    id: rule.id,
    name: rule.name,
    category,
    categoryLabel: ADMIN_TAB_LABELS[category],
    terms: Array.isArray(rule.terms) ? [...rule.terms] : [],
    action: rule.action,
    kind: rule.kind,
    appliesTo: rule.applies_to,
    enabled: rule.enabled,
    detectedCount: rule.detected_count,
    lastDetectedAt: rule.last_detected_at ?? null,
    createdBy: rule.created_by ?? null,
    updatedBy: rule.updated_by ?? null,
  };
}

/** The audit snapshot of a rule: its settings and term count, not its terms. */
function auditSnapshot(rule: KeywordRule): Record<string, unknown> {
  return {
    name: rule.name,
    category: rule.category,
    action: rule.action,
    appliesTo: rule.applies_to,
    enabled: rule.enabled,
    termCount: Array.isArray(rule.terms) ? rule.terms.length : 0,
  };
}

function cleanName(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("A rule needs a name.");
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw badRequest(`A rule name must be ${NAME_MIN}–${NAME_MAX} characters.`);
  }
  return name;
}

function checkCategory(raw: unknown): PolicyCategory {
  if (!isPolicyCategory(raw)) throw badRequest("Choose one of the policy categories.");
  return raw;
}

function checkAction(raw: unknown): KeywordAction {
  if (typeof raw !== "string" || !(ALL_KEYWORD_ACTIONS as readonly string[]).includes(raw)) {
    throw badRequest("The action must be hold, signal or monitor.");
  }
  return raw as KeywordAction;
}

function checkAppliesTo(raw: unknown): KeywordAppliesTo {
  if (typeof raw !== "string" || !(ALL_KEYWORD_APPLIES_TO as readonly string[]).includes(raw)) {
    throw badRequest("A rule applies to all content, reports or comments.");
  }
  return raw as KeywordAppliesTo;
}

function checkTerms(raw: unknown): string[] {
  const result = validateRuleTerms(raw);
  if (!result.ok) throw badRequest(result.error);
  return result.terms;
}

const nameTaken = (): HttpError => new HttpError("A rule with that name already exists.", 409);

class KeywordRulesService {
  private cache: RuleCache | null = null;
  private loading: Promise<RuleCache> | null = null;

  // ── The pipeline's read path ────────────────────────────────────────────

  /**
   * The enabled rules that apply to a target type, compiled. Rules with
   * `applies_to = all` apply to both; soft-deleted and disabled rules to
   * neither. Throws if the database cannot be read — the worker's catch-all
   * then retries the run, which is right: a run must not skip the keyword stage
   * because a query failed.
   */
  async rulesFor(targetType: ModerationTargetType): Promise<CompiledRule[]> {
    const cache = await this.current();
    return cache.byTarget[targetType];
  }

  /** Drop the local cache (after a write through this service). */
  invalidate(): void {
    this.cache = null;
  }

  private async current(): Promise<RuleCache> {
    const now = Date.now();
    if (this.cache && now - this.cache.checkedAt < KEY_CHECK_INTERVAL_MS) return this.cache;
    // One refresh at a time per process; concurrent runs share it.
    if (!this.loading) {
      this.loading = this.refresh().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async refresh(): Promise<RuleCache> {
    const key = await this.cacheKey();
    if (this.cache && this.cache.key === key) {
      this.cache.checkedAt = Date.now();
      return this.cache;
    }

    const rows = await KeywordRule.findAll({ where: { enabled: true }, order: [["name", "ASC"]] });
    const reports: CompiledRule[] = [];
    const comments: CompiledRule[] = [];
    for (const row of rows) {
      if (!isPolicyCategory(row.category)) continue;
      const compiled = compileRule({
        id: row.id,
        name: row.name,
        category: row.category,
        action: row.action,
        terms: Array.isArray(row.terms) ? row.terms : [],
      });
      if (compiled.terms.length === 0) continue;
      if (row.applies_to === "all" || row.applies_to === "reports") reports.push(compiled);
      if (row.applies_to === "all" || row.applies_to === "comments") comments.push(compiled);
    }

    const next: RuleCache = {
      key,
      checkedAt: Date.now(),
      byTarget: { report: reports, comment: comments },
    };
    this.cache = next;
    logger.debug("[moderation] keyword rules loaded", {
      reportRules: reports.length,
      commentRules: comments.length,
    });
    return next;
  }

  /** The change marker (see the file header). Includes soft-deleted rows. */
  private async cacheKey(): Promise<string> {
    const rows = await sequelize.query<{ updated: string | null; deleted: string | null; total: string }>(
      `SELECT CAST(MAX(updated_on) AS text) AS updated,
              CAST(MAX(deleted_on) AS text) AS deleted,
              CAST(COUNT(*) AS text)        AS total
         FROM keyword_rules`,
      { type: QueryTypes.SELECT },
    );
    const row = rows[0];
    return `${row?.updated ?? ""}|${row?.deleted ?? ""}|${row?.total ?? "0"}`;
  }

  /**
   * Count this run's detections (§5.3 step 6): once per rule per run, however
   * many of its terms matched, and never for the built-in detectors (null id).
   * `updated_on` is left alone on purpose — see the file header.
   */
  async recordDetections(tx: Transaction, hits: readonly KeywordHit[]): Promise<number> {
    const ids = [...new Set(hits.map((hit) => hit.ruleId).filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) return 0;
    await sequelize.query(
      `UPDATE keyword_rules
          SET detected_count = detected_count + 1, last_detected_at = :now
        WHERE id IN (:ids)`,
      { replacements: { ids, now: nowIso() }, transaction: tx },
    );
    return ids.length;
  }

  // ── CRUD primitives (§8.1) ──────────────────────────────────────────────

  /** A page of rules, system rules first, then by name. */
  async listRules(query: ListRulesQuery = {}): Promise<ListRulesResult> {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(LIST_LIMIT_MAX, Math.max(1, Math.floor(query.limit ?? 25)));

    const and: WhereOptions[] = [];
    if (query.action) and.push({ action: query.action });
    if (typeof query.enabled === "boolean") and.push({ enabled: query.enabled });
    if (query.category) and.push({ category: query.category });
    if (query.appliesTo) and.push({ applies_to: query.appliesTo });
    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      and.push({
        [Op.or]: [
          { name: { [Op.iLike]: pattern } },
          sequelize.where(sequelize.cast(sequelize.col("terms"), "text"), { [Op.iLike]: pattern }),
        ],
      });
    }

    const { rows, count } = await KeywordRule.findAndCountAll({
      where: and.length > 0 ? { [Op.and]: and } : {},
      order: [
        ["kind", "DESC"],
        ["name", "ASC"],
      ],
      limit,
      offset: (page - 1) * limit,
    });
    return { items: rows.map(toView), total: count, page, limit };
  }

  /** One rule, or 404. */
  async getRule(id: string): Promise<KeywordRuleView> {
    const rule = await KeywordRule.findByPk(id);
    if (!rule) throw notFound("That keyword rule no longer exists.");
    return toView(rule);
  }

  /** Create a `custom` rule. 409 if a live rule already has the name. */
  async createRule(input: CreateRuleInput, actor: RuleActor): Promise<KeywordRuleView> {
    const name = cleanName(input.name);
    const category = checkCategory(input.category);
    const terms = checkTerms(input.terms);
    const action = checkAction(input.action ?? "signal");
    const appliesTo = checkAppliesTo(input.appliesTo ?? "all");
    const enabled = input.enabled ?? true;

    try {
      const rule = await sequelize.transaction(async (tx) => {
        await this.setLockTimeout(tx);
        await this.assertNameFree(tx, name, null);
        const created = await KeywordRule.create(
          {
            name,
            category,
            terms,
            action,
            kind: "custom",
            applies_to: appliesTo,
            enabled,
            created_by: actor.adminId,
            updated_by: actor.adminId,
          },
          { transaction: tx },
        );
        await auditService.record(tx, {
          actorKind: "admin",
          actorId: actor.adminId,
          action: "keyword_rule.create",
          targetType: "keyword_rule",
          targetId: created.id,
          metadata: { after: auditSnapshot(created) },
          ip: actor.ip ?? null,
        });
        return created;
      });
      this.invalidate();
      logger.info("[moderation] keyword rule created", { ruleId: rule.id, action, category });
      return toView(rule);
    } catch (err) {
      if (err instanceof UniqueConstraintError) throw nameTaken();
      throw err;
    }
  }

  /**
   * Change a rule. Only the supplied fields change. Enabling a rule that has no
   * terms (the seeded *Hate Speech & Discrimination* rule ships that way) is
   * refused, because an enabled rule that can never match would look like
   * protection that is not there.
   */
  async updateRule(id: string, patch: UpdateRuleInput, actor: RuleActor): Promise<KeywordRuleView> {
    const changes: Partial<{
      name: string;
      category: PolicyCategory;
      terms: string[];
      action: KeywordAction;
      applies_to: KeywordAppliesTo;
      enabled: boolean;
    }> = {};
    if (patch.name !== undefined) changes.name = cleanName(patch.name);
    if (patch.category !== undefined) changes.category = checkCategory(patch.category);
    if (patch.terms !== undefined) changes.terms = checkTerms(patch.terms);
    if (patch.action !== undefined) changes.action = checkAction(patch.action);
    if (patch.appliesTo !== undefined) changes.applies_to = checkAppliesTo(patch.appliesTo);
    if (patch.enabled !== undefined) changes.enabled = Boolean(patch.enabled);

    try {
      const rule = await sequelize.transaction(async (tx) => {
        await this.setLockTimeout(tx);
        const existing = await KeywordRule.findByPk(id, { transaction: tx, lock: tx.LOCK.UPDATE });
        if (!existing) throw notFound("That keyword rule no longer exists.");
        const before = auditSnapshot(existing);

        if (changes.name !== undefined && changes.name.toLowerCase() !== existing.name.toLowerCase()) {
          await this.assertNameFree(tx, changes.name, existing.id);
        }
        const finalTerms = changes.terms ?? (Array.isArray(existing.terms) ? existing.terms : []);
        const finalEnabled = changes.enabled ?? existing.enabled;
        if (finalEnabled && finalTerms.length === 0) {
          throw badRequest("Add at least one term before enabling this rule.");
        }

        await existing.update({ ...changes, updated_by: actor.adminId }, { transaction: tx });
        await auditService.record(tx, {
          actorKind: "admin",
          actorId: actor.adminId,
          action: "keyword_rule.update",
          targetType: "keyword_rule",
          targetId: existing.id,
          metadata: {
            before,
            after: auditSnapshot(existing),
            termsChanged: changes.terms !== undefined,
          },
          ip: actor.ip ?? null,
        });
        return existing;
      });
      this.invalidate();
      logger.info("[moderation] keyword rule updated", { ruleId: rule.id });
      return toView(rule);
    } catch (err) {
      if (err instanceof UniqueConstraintError) throw nameTaken();
      throw err;
    }
  }

  /**
   * Soft-delete a rule (paranoid). Runs that cite its id in `keyword_hits`
   * still resolve to its name, and the name becomes free for a new rule. The
   * row is touched first so `updated_on` moves with `deleted_on`.
   */
  async softDeleteRule(id: string, actor: RuleActor): Promise<void> {
    await sequelize.transaction(async (tx) => {
      await this.setLockTimeout(tx);
      const existing = await KeywordRule.findByPk(id, { transaction: tx, lock: tx.LOCK.UPDATE });
      if (!existing) throw notFound("That keyword rule no longer exists.");
      const before = auditSnapshot(existing);
      await existing.update({ updated_by: actor.adminId, enabled: false }, { transaction: tx });
      await existing.destroy({ transaction: tx });
      await auditService.record(tx, {
        actorKind: "admin",
        actorId: actor.adminId,
        action: "keyword_rule.delete",
        targetType: "keyword_rule",
        targetId: existing.id,
        metadata: { before },
        ip: actor.ip ?? null,
      });
    });
    this.invalidate();
    logger.info("[moderation] keyword rule deleted", { ruleId: id });
  }

  // ── Internals ───────────────────────────────────────────────────────────

  /** §5.4: a lock wait never hangs a connection. */
  private async setLockTimeout(tx: Transaction): Promise<void> {
    await sequelize.query("SET LOCAL lock_timeout = '5s'", { transaction: tx });
  }

  /** 409 unless no *live* rule (other than `exceptId`) has this name, case-insensitively. */
  private async assertNameFree(tx: Transaction, name: string, exceptId: string | null): Promise<void> {
    const rows = await sequelize.query<{ id: string }>(
      `SELECT id FROM keyword_rules
        WHERE lower(name) = lower(:name) AND deleted_on IS NULL
          ${exceptId ? "AND id <> :exceptId" : ""}
        LIMIT 1`,
      { replacements: { name, exceptId }, type: QueryTypes.SELECT, transaction: tx },
    );
    if (rows.length > 0) throw nameTaken();
  }
}

export const keywordRulesService = new KeywordRulesService();
export default keywordRulesService;
