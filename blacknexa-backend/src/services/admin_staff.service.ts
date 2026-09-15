/**
 * Operator account management — the Admin & Roles module.
 *
 * Three rules are enforced here and they are the point of the module, so they
 * are stated once rather than repeated at each call site:
 *
 *   1. Only a super admin sees super admin accounts. To everyone else those
 *      rows do not exist, which is also why the count endpoint omits them.
 *   2. Super admin accounts cannot be edited, disabled or deleted through this
 *      module. That is what stops one administrator locking every other one out,
 *      and it is why the console shows those rows as "Protected".
 *   3. Nobody may disable or delete their own account. Doing so would end the
 *      session performing the action, which is confusing at best.
 *
 * The console applies the same rules to decide what to render. These are the
 * ones that decide what actually happens.
 */

import crypto from "crypto";
import { Op, type WhereOptions, type InferAttributes } from "sequelize";

import env from "@/config/env.config";
import logger from "@/utils/logger.util";
import AdminUser from "@/models/admin_user.model";
import AdminCredential from "@/models/admin_credential.model";
import authService from "@/services/auth.service";
import mailerService from "@/services/mailer.service";
import { AuthError } from "@/services/auth.service";
import { ADMIN_ROLE_LABELS, type AdminProfile, type AdminRole } from "@/types/admin.interface";

export interface StaffListQuery {
  page: number;
  limit: number;
  search?: string;
  role?: AdminRole;
  status?: "active" | "disabled";
}

export interface StaffListResult {
  items: AdminProfile[];
  total: number;
}

/** Active-account counts, one per role. */
export type StaffSummary = Record<AdminRole, number>;

export interface CreateStaffInput {
  name: string;
  email: string;
  role: AdminRole;
  password: string;
}

export interface UpdateStaffInput {
  name?: string;
  role?: AdminRole;
}

/**
 * A temporary password that satisfies the console's own policy.
 *
 * Assembled from a shuffled pool with one guaranteed character from each
 * required class, rather than generated and re-rolled until it happens to pass —
 * a retry loop on a random string has no bound on how long it runs.
 */
function generateTemporaryPassword(): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = lower + upper + digits;

  const pick = (set: string) => set[crypto.randomInt(0, set.length)]!;

  const chars = [pick(lower), pick(upper), pick(digits)];
  // 16 characters: comfortably over the 12-character floor, and long enough
  // that it is obviously meant to be copied rather than memorised.
  while (chars.length < 16) chars.push(pick(all));

  // Fisher–Yates, so the guaranteed characters are not always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

class AdminStaffService {
  /** Whether the acting role may see and manage super admin accounts. */
  private isSuperAdmin(role: string): boolean {
    return role === "superadmin";
  }

  /**
   * Load a target account and check it may be acted on.
   *
   * Every write goes through this, so the protection rules cannot be forgotten
   * by a new endpoint.
   */
  private async loadManageable(
    targetId: string,
    actor: { id: string; role: string },
    action: string,
  ): Promise<AdminUser> {
    const target = await AdminUser.findByPk(targetId);
    if (!target) throw new AuthError("That staff account could not be found.", 404);

    // A non-super-admin must not be able to confirm a super admin exists, so
    // this is a 404 rather than a 403.
    if (target.role === "superadmin" && !this.isSuperAdmin(actor.role)) {
      throw new AuthError("That staff account could not be found.", 404);
    }

    if (target.role === "superadmin") {
      throw new AuthError(
        "Super Admin accounts are protected and cannot be changed from this screen.",
        403,
      );
    }

    if (target.id === actor.id) {
      throw new AuthError(`You cannot ${action} your own account.`, 403);
    }

    return target;
  }

  /** One page of the staff directory, scoped to what the actor may see. */
  async list(query: StaffListQuery, actorRole: string): Promise<StaffListResult> {
    const where: WhereOptions<InferAttributes<AdminUser>> = {};
    const and: WhereOptions<InferAttributes<AdminUser>>[] = [];

    if (!this.isSuperAdmin(actorRole)) {
      and.push({ role: { [Op.ne]: "superadmin" } });
    }

    if (query.role) and.push({ role: query.role });
    if (query.status) and.push({ is_active: query.status === "active" });

    if (query.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      and.push({
        [Op.or]: [
          // `iLike` is PostgreSQL's case-insensitive LIKE; the project is
          // Postgres-only, so this needs no lower() wrapper on the column.
          { name: { [Op.iLike]: term } },
          { email: { [Op.iLike]: term } },
        ],
      });
    }

    if (and.length > 0) Object.assign(where, { [Op.and]: and });

    const { rows, count } = await AdminUser.findAndCountAll({
      where,
      order: [["created_on", "DESC"]],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return {
      items: rows.map((row) => authService.toProfile(row)),
      total: count,
    };
  }

  /** Active-account counts per role, for the KPI tiles. */
  async summary(actorRole: string): Promise<StaffSummary> {
    const rows = await AdminUser.findAll({
      where: { is_active: true },
      attributes: ["role"],
    });

    const counts: StaffSummary = {
      superadmin: 0,
      moderator: 0,
      advocate: 0,
      staff: 0,
    };
    for (const row of rows) {
      const role = row.role as AdminRole;
      if (role in counts) counts[role] += 1;
    }

    // A role the actor cannot see must not be reported as a number either.
    if (!this.isSuperAdmin(actorRole)) counts.superadmin = 0;

    return counts;
  }

  /** Create an operator account. */
  async create(input: CreateStaffInput, actor: { id: string }): Promise<AdminProfile> {
    const email = input.email.trim().toLowerCase();

    const existing = await AdminUser.findOne({ where: { email } });
    if (existing) {
      throw new AuthError("An account with that email address already exists.", 409);
    }

    const admin = await AdminUser.create({
      email,
      name: input.name.trim(),
      // Hashed by the model's beforeSave hook.
      password_hash: input.password,
      role: input.role,
      // The creating administrator chose this password, so it is not a standing
      // credential — the holder picks their own before they can work.
      must_change_password: true,
    });

    // Best-effort: an account that exists but whose welcome mail bounced is a
    // far better outcome than a failed creation the administrator must retry.
    void mailerService
      .sendAdminAccountCreated(
        admin.email,
        admin.name,
        ADMIN_ROLE_LABELS[input.role],
        env.adminConsoleUrl,
      )
      .catch((err: unknown) => {
        logger.warn("[staff] welcome email failed", { id: admin.id, err });
      });

    logger.info("[staff] account created", {
      id: admin.id,
      role: admin.role,
      by: actor.id,
    });
    return authService.toProfile(admin);
  }

  /** Update a name or role. The email is the account's identity and is fixed. */
  async update(
    targetId: string,
    input: UpdateStaffInput,
    actor: { id: string; role: string },
  ): Promise<AdminProfile> {
    const target = await this.loadManageable(targetId, actor, "edit");

    if (input.name !== undefined) target.name = input.name.trim();
    if (input.role !== undefined && input.role !== target.role) {
      // Promoting someone to super admin would place them beyond this module's
      // reach, so it is not something this endpoint can do.
      if (input.role === "superadmin") {
        throw new AuthError(
          "Super Admin cannot be assigned from this screen.",
          403,
        );
      }
      target.role = input.role;
      // A role change changes what their existing token is allowed to do, so the
      // old session is ended rather than left carrying stale claims.
      target.refresh_token_id = null;
    }

    await target.save();
    logger.info("[staff] account updated", { id: target.id, by: actor.id });
    return authService.toProfile(target);
  }

  /**
   * Enable or disable console access.
   *
   * Disabling revokes the refresh token so the operator is signed out within one
   * access-token lifetime rather than whenever they next happen to refresh.
   */
  async setActive(
    targetId: string,
    isActive: boolean,
    actor: { id: string; role: string },
  ): Promise<AdminProfile> {
    const target = await this.loadManageable(
      targetId,
      actor,
      isActive ? "enable" : "disable",
    );

    target.is_active = isActive;
    if (!isActive) target.refresh_token_id = null;
    else {
      // Re-enabling clears any lockout, so a disabled-then-restored account is
      // not still serving out a lock nobody can see.
      target.failed_login_count = 0;
      target.locked_until = null;
    }

    await target.save();
    logger.info("[staff] account status changed", {
      id: target.id,
      isActive,
      by: actor.id,
    });
    return authService.toProfile(target);
  }

  /**
   * Issue a new temporary password.
   *
   * The plaintext is returned exactly once, in this response, and only the hash
   * is stored — so the value the console shows is the only copy that exists.
   */
  async resetPassword(
    targetId: string,
    actor: { id: string; role: string },
  ): Promise<{ temporaryPassword: string }> {
    const target = await this.loadManageable(targetId, actor, "reset the password for");

    const temporaryPassword = generateTemporaryPassword();
    target.password_hash = temporaryPassword;
    target.must_change_password = true;
    // The old session must not survive a password the holder no longer knows.
    target.refresh_token_id = null;
    target.failed_login_count = 0;
    target.locked_until = null;
    await target.save();

    // Any pending sign-in or reset code for this account is now meaningless.
    await AdminCredential.update(
      { consumed_at: new Date().toISOString() },
      { where: { admin_id: target.id, consumed_at: null } },
    );

    logger.info("[staff] password reset by administrator", {
      id: target.id,
      by: actor.id,
    });
    return { temporaryPassword };
  }

  /** Delete an operator account. Soft-deleted, so the audit trail survives. */
  async remove(targetId: string, actor: { id: string; role: string }): Promise<void> {
    const target = await this.loadManageable(targetId, actor, "delete");
    await target.destroy();
    logger.info("[staff] account deleted", { id: target.id, by: actor.id });
  }
}

export const adminStaffService = new AdminStaffService();
export default adminStaffService;
