/**
 * `faq_categories` and `faqs` — the single source of FAQ content.
 *
 * Replaces three hardcoded lists that had drifted apart: the marketing site's
 * `data/faq.ts`, the mobile Help screen's bundled fallback, and the console's
 * design fixtures. One table, edited in one place, rendered on both surfaces.
 *
 * ── Why the category id is a slug, not a UUID ───────────────────────────────
 * Both public payloads send `{ id, label }` category pairs and tag each item
 * with a `categoryId`, and the mobile screen filters chips by that id. A slug
 * ("privacy") survives a label being reworded ("Privacy" → "Privacy and
 * Security") without invalidating anything that referenced it, and it reads
 * plainly in a payload during debugging. A UUID would buy nothing here: these
 * rows are created by an editor, not by a client, so there is no id-collision
 * problem to solve.
 *
 * ── Why `surfaces` is JSONB ────────────────────────────────────────────────
 * An entry belongs to zero, one or both surfaces, and that set is read on every
 * public request but written rarely. A Postgres array would work equally well;
 * JSONB is what this codebase already reaches for when a column holds a small
 * structured value (see `article.model.ts`, `report.model.ts`), so it stays
 * consistent rather than introducing a second convention.
 *
 * ── Soft delete ────────────────────────────────────────────────────────────
 * Paranoid, like `contact_inquiries`. Removing a FAQ is an editorial tidy-up,
 * not an erasure request, and a published answer that vanishes with no trace
 * takes with it the record of what the platform was telling people.
 */

import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";

import sequelize from "@/config/database.config";
import { BASE_OPTIONS, SOFT_DELETE_OPTIONS, nowIso } from "@/models/model_options";
import { uuidv4 } from "@/utils/id.util";
import type { FaqStatus, FaqSurface } from "@/types/faq.interface";

// ─────────────────────────────────────────────────────────────────────────────
// faq_categories
// ─────────────────────────────────────────────────────────────────────────────

export class FaqCategory extends Model<
  InferAttributes<FaqCategory>,
  InferCreationAttributes<FaqCategory>
> {
  /** Slug. Stable across label edits — see the file header. */
  declare id: string;
  declare label: string;
  /** Ascending. Decides chip order on both surfaces. */
  declare sort_order: CreationOptional<number>;
}

FaqCategory.init(
  {
    id: {
      type: DataTypes.STRING(64),
      primaryKey: true,
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "FaqCategory",
    tableName: "faq_categories",
    ...BASE_OPTIONS,
  },
);

FaqCategory.beforeValidate((row) => {
  if (row.id) row.id = row.id.trim().toLowerCase();
});

// ─────────────────────────────────────────────────────────────────────────────
// faqs
// ─────────────────────────────────────────────────────────────────────────────

export class Faq extends Model<InferAttributes<Faq>, InferCreationAttributes<Faq>> {
  declare id: CreationOptional<string>;
  declare category_id: string;
  declare question: string;
  declare answer: string;
  declare status: CreationOptional<FaqStatus>;
  /** Which public surfaces show this entry. Empty means "nowhere, yet". */
  declare surfaces: CreationOptional<FaqSurface[]>;
  /** Mobile Help's "Start here" set. Ignored by the website. */
  declare start_here: CreationOptional<boolean>;
  declare sort_order: CreationOptional<number>;
  /**
   * Last editorial change, ISO-8601.
   *
   * A contract column rather than the ORM's `updated_on`, following the
   * project's timestamp strategy: the console renders and sorts on this, while
   * `updated_on` stays audit metadata that is never serialised.
   */
  declare updated_at: CreationOptional<string>;
}

Faq.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      defaultValue: DataTypes.UUIDV4,
    },
    category_id: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    answer: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      // New entries start invisible. Publishing is a deliberate act, and the
      // alternative — a half-written answer going live the moment it is saved —
      // is the wrong default for content the whole user base reads.
      defaultValue: "draft",
    },
    surfaces: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: ["app", "website"],
    },
    start_here: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    updated_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "",
    },
  },
  {
    sequelize,
    modelName: "Faq",
    tableName: "faqs",
    ...SOFT_DELETE_OPTIONS,
    indexes: [
      { name: "idx_faqs_status", fields: ["status"] },
      { name: "idx_faqs_category", fields: ["category_id"] },
      // Both public reads order by this pair, and both filter on status first.
      { name: "idx_faqs_order", fields: ["sort_order", "created_on"] },
    ],
  },
);

Faq.beforeValidate((row) => {
  if (!row.id) row.id = uuidv4();
  if (row.category_id) row.category_id = row.category_id.trim().toLowerCase();
});

/** Stamp the contract column on every write, so the console never shows a stale date. */
Faq.beforeSave((row) => {
  row.updated_at = nowIso();
});

FaqCategory.hasMany(Faq, { foreignKey: "category_id", as: "faqs" });
Faq.belongsTo(FaqCategory, { foreignKey: "category_id", as: "category" });

export default Faq;
