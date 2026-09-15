/**
 * Contact-us inquiries — submission and the console's queue.
 *
 * Two audiences share this service and they are not equally trusted, which is
 * the shape of the file: `submit()` is reachable by anyone on the internet, and
 * everything below it is reachable only by an authenticated operator. Keeping
 * them together is deliberate — the fields a submission may set sit in the same
 * file as the fields only an operator may set, so it is plain at a glance that
 * `status`, `handled_by` and `internal_note` are never taken from a submission.
 */

import { Op, type WhereOptions, type InferAttributes } from "sequelize";

import logger from "@/utils/logger.util";
import { notFound } from "@/middlewares/error.middleware";
import ContactInquiry from "@/models/contact_inquiry.model";
import AdminUser from "@/models/admin_user.model";
import { nowIso } from "@/models/model_options";
import {
  CONTACT_STATUSES,
  CONTACT_SUBJECT_LABELS,
  type ContactInquiryDto,
  type ContactStatus,
  type ContactSubject,
  type ContactSummary,
} from "@/types/contact.interface";

/** What the public form supplies. Nothing here decides how it is handled. */
export interface SubmitContactInput {
  name: string;
  email: string;
  subject: ContactSubject;
  message: string;
}

/** Request metadata, captured by the controller rather than sent by the caller. */
export interface SubmitContactMeta {
  ipAddress?: string;
  userAgent?: string;
}

export interface ContactListQuery {
  page: number;
  limit: number;
  search?: string;
  status?: ContactStatus;
  subject?: ContactSubject;
}

export interface ContactListResult {
  items: ContactInquiryDto[];
  total: number;
}

/** The operator-supplied half of an update. Both fields are optional. */
export interface UpdateContactInput {
  status?: ContactStatus;
  internalNote?: string | null;
}

class ContactService {
  /**
   * Serialise a row for the console.
   *
   * `ip_address` and `user_agent` are dropped here rather than excluded by a
   * default scope, because an abuse-investigation path that does want them
   * reads the model directly and a scope would quietly hide them there too.
   *
   * @param handlerName Display name for `handled_by`, once resolved.
   */
  private toDto(row: ContactInquiry, handlerName?: string | null): ContactInquiryDto {
    const subject = row.subject as ContactSubject;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      subject,
      subjectLabel: CONTACT_SUBJECT_LABELS[subject] ?? subject,
      message: row.message,
      status: row.status as ContactStatus,
      source: row.source,
      submittedAt: row.submitted_at,
      // Falls back to the raw id when the operator account has since been
      // removed — "handled by someone who is gone" beats an empty column.
      handledBy: handlerName ?? row.handled_by,
      handledAt: row.handled_at,
      internalNote: row.internal_note,
    };
  }

  /**
   * Resolve operator ids to display names in one query.
   *
   * A page of twenty rows worked by three people is three names, not twenty
   * lookups — and an association would not help here, because `handled_by`
   * carries no foreign key: a deleted operator must not take the enquiry's
   * history with them.
   */
  private async handlerNames(rows: ContactInquiry[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.handled_by).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();

    const admins = await AdminUser.findAll({
      where: { id: { [Op.in]: ids } },
      attributes: ["id", "name"],
      // Include soft-deleted operators: the name is being shown as history, and
      // history does not stop being true when the account is closed.
      paranoid: false,
    });
    return new Map(admins.map((a) => [a.id, a.name]));
  }

  /**
   * Record a submission from the marketing site.
   *
   * Returns only the id and the timestamp. The form shows a thank-you, not the
   * stored row, and echoing the message back would turn this endpoint into a
   * way to confirm what the server kept.
   */
  async submit(
    input: SubmitContactInput,
    meta: SubmitContactMeta = {},
  ): Promise<{ id: string; submittedAt: string }> {
    const inquiry = await ContactInquiry.create({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      subject: input.subject,
      message: input.message.trim(),
      // Not taken from the request: a submission cannot arrive pre-triaged.
      status: "new",
      source: "website",
      ip_address: (meta.ipAddress ?? "").slice(0, 64),
      user_agent: (meta.userAgent ?? "").slice(0, 512),
      submitted_at: nowIso(),
    });

    // The message body is deliberately not logged — it is correspondence, and
    // the console is where it is meant to be read.
    logger.info("[contact] inquiry received", {
      id: inquiry.id,
      subject: inquiry.subject,
    });

    return { id: inquiry.id, submittedAt: inquiry.submitted_at };
  }

  /** One page of the queue. */
  async list(query: ContactListQuery): Promise<ContactListResult> {
    const where: WhereOptions<InferAttributes<ContactInquiry>> = {};
    const and: WhereOptions<InferAttributes<ContactInquiry>>[] = [];

    if (query.status) and.push({ status: query.status });
    if (query.subject) and.push({ subject: query.subject });

    if (query.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      and.push({
        [Op.or]: [
          // `iLike` is PostgreSQL's case-insensitive LIKE; the project is
          // Postgres-only, so these columns need no lower() wrapper.
          { name: { [Op.iLike]: term } },
          { email: { [Op.iLike]: term } },
          { message: { [Op.iLike]: term } },
        ],
      });
    }

    if (and.length > 0) Object.assign(where, { [Op.and]: and });

    const { rows, count } = await ContactInquiry.findAndCountAll({
      where,
      order: [["submitted_at", "DESC"]],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    const names = await this.handlerNames(rows);
    return {
      items: rows.map((row) =>
        this.toDto(row, row.handled_by ? names.get(row.handled_by) : null),
      ),
      total: count,
    };
  }

  /** Counts per status, plus the overall total, for the KPI tiles. */
  async summary(): Promise<ContactSummary> {
    const rows = await ContactInquiry.findAll({ attributes: ["status"] });

    const counts = CONTACT_STATUSES.reduce(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<ContactStatus, number>,
    );

    for (const row of rows) {
      const status = row.status as ContactStatus;
      if (status in counts) counts[status] += 1;
    }

    return { ...counts, total: rows.length };
  }

  /** One enquiry, in full. */
  async get(id: string): Promise<ContactInquiryDto> {
    const row = await this.load(id);
    const names = await this.handlerNames([row]);
    return this.toDto(row, row.handled_by ? names.get(row.handled_by) : null);
  }

  /**
   * Change the status, the internal note, or both.
   *
   * `handled_by` and `handled_at` are stamped from the acting operator rather
   * than accepted from the request, so the queue records who actually moved an
   * enquiry and not who a caller said moved it.
   */
  async update(
    id: string,
    input: UpdateContactInput,
    actor: { id: string },
  ): Promise<ContactInquiryDto> {
    const row = await this.load(id);

    if (input.status !== undefined) row.status = input.status;
    /*
     * An empty string clears the note; `undefined` leaves it alone. The
     * distinction is the point — a PATCH that only sets a status must not wipe
     * the note the previous operator left behind.
     */
    if (input.internalNote !== undefined) {
      row.internal_note = input.internalNote ? input.internalNote.trim() : null;
    }

    row.handled_by = actor.id;
    row.handled_at = nowIso();
    await row.save();

    logger.info("[contact] inquiry updated", {
      id: row.id,
      status: row.status,
      by: actor.id,
    });

    const names = await this.handlerNames([row]);
    return this.toDto(row, names.get(actor.id));
  }

  /** Remove an enquiry from the queue. Soft-deleted — the record survives. */
  async remove(id: string, actor: { id: string }): Promise<void> {
    const row = await this.load(id);
    await row.destroy();
    logger.info("[contact] inquiry deleted", { id, by: actor.id });
  }

  /** Fetch a row, or raise the 404 every operator path shares. */
  private async load(id: string): Promise<ContactInquiry> {
    const row = await ContactInquiry.findByPk(id);
    if (!row) throw notFound("That enquiry could not be found.");
    return row;
  }
}

export const contactService = new ContactService();
export default contactService;
