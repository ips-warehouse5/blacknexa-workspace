/**
 * `contact_inquiries` — messages sent from the marketing site's contact form.
 *
 * The site posts to its own Next.js route, which forwards here; nothing about a
 * row is round-tripped by a client afterwards, so this is one of the entities
 * where the UUID-primary-key rule applies cleanly (as with `admin_users`).
 *
 * `submitted_at` is a TEXT ISO-8601 column rather than the ORM's `created_on`,
 * following the project's timestamp strategy: it is a contract field the console
 * renders and sorts on, while `created_on` stays audit metadata that is never
 * serialised.
 *
 * Soft-deleted. Removing an enquiry from the queue is a tidying action, not an
 * erasure request, and a support record that vanishes completely takes the
 * evidence of what was asked with it.
 */

import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";

import sequelize from "@/config/database.config";
import { SOFT_DELETE_OPTIONS, nowIso } from "@/models/model_options";
import { uuidv4 } from "@/utils/id.util";
import type { ContactSource, ContactStatus, ContactSubject } from "@/types/contact.interface";

export class ContactInquiry extends Model<
  InferAttributes<ContactInquiry>,
  InferCreationAttributes<ContactInquiry>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare email: string;
  declare subject: CreationOptional<ContactSubject>;
  declare message: string;
  declare status: CreationOptional<ContactStatus>;
  declare source: CreationOptional<ContactSource>;

  /**
   * Recorded for abuse investigation only, and never returned to the console.
   * Behind a proxy this is only the real client address when `TRUST_PROXY` is
   * set — otherwise every row carries the load balancer's.
   */
  declare ip_address: CreationOptional<string>;
  declare user_agent: CreationOptional<string>;

  declare submitted_at: CreationOptional<string>;

  /** Operator who last moved the enquiry, and when. Null while untouched. */
  declare handled_by: CreationOptional<string | null>;
  declare handled_at: CreationOptional<string | null>;

  /** Free-text note for whoever picks the enquiry up next. Never emailed out. */
  declare internal_note: CreationOptional<string | null>;
}

ContactInquiry.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      // Declarative fallback; the `beforeValidate` hook is the primary generator
      // and covers the path a raw bulkCreate would skip.
      defaultValue: DataTypes.UUIDV4,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { isEmail: true },
    },
    subject: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "general",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "new",
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "website",
    },
    ip_address: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "",
    },
    user_agent: {
      type: DataTypes.STRING(512),
      allowNull: false,
      defaultValue: "",
    },
    submitted_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: nowIso,
    },
    handled_by: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    handled_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    internal_note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "ContactInquiry",
    tableName: "contact_inquiries",
    ...SOFT_DELETE_OPTIONS,
    hooks: {
      // `beforeValidate` rather than `beforeCreate`: validation runs first, and
      // `allowNull: false` on the primary key would fail before a later hook.
      beforeValidate(instance) {
        if (!instance.id) instance.id = uuidv4();
        if (instance.email) instance.email = instance.email.trim().toLowerCase();
      },
    },
    indexes: [
      // The queue's default view: newest first, optionally narrowed by status.
      {
        name: "idx_contact_status_submitted",
        fields: ["status", { name: "submitted_at", order: "DESC" }],
      },
      // "Has this address written before?" — the first question when triaging.
      { name: "idx_contact_email", fields: ["email"] },
    ],
  },
);

export default ContactInquiry;
