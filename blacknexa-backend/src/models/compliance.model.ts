/**
 * `moderation_log` and `tos_agreements` — the compliance audit trail.
 *
 * `moderation_log.content_preview` stores only the first 200 characters, as the
 * original did: enough to review a decision, not a full copy of user content.
 *
 * `tos_agreements` records the IP and user agent at the moment of acceptance,
 * which is what makes the agreement evidentiary. Behind a proxy that requires
 * `TRUST_PROXY` to be set, otherwise every row records the load balancer's
 * address (the Worker read `CF-Connecting-IP`; here it is `req.ip` resolved
 * through `X-Forwarded-For`).
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";

export class ModerationLog extends Model<
  InferAttributes<ModerationLog>,
  InferCreationAttributes<ModerationLog>
> {
  declare id: string;
  declare content_hash: string;
  declare approved: boolean;
  declare violation_category: string;
  /** JSON array of the flagged terms. */
  declare flagged_terms_json: string;
  declare moderated_at: string;
  declare content_preview: string;
}

ModerationLog.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    content_hash: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    approved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
    },
    violation_category: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "",
    },
    flagged_terms_json: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "[]",
    },
    moderated_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    content_preview: {
      type: DataTypes.STRING(256),
      allowNull: false,
      defaultValue: "",
    },
  },
  {
    sequelize,
    modelName: "ModerationLog",
    tableName: "moderation_log",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_mod_hash", fields: ["content_hash"] }],
  },
);

export class TosAgreement extends Model<
  InferAttributes<TosAgreement>,
  InferCreationAttributes<TosAgreement>
> {
  declare id: string;
  declare user_id: string;
  declare tos_version: string;
  declare agreed_at: string;
  declare ip_address: string;
  declare user_agent: string;
}

TosAgreement.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tos_version: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    agreed_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
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
  },
  {
    sequelize,
    modelName: "TosAgreement",
    tableName: "tos_agreements",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_tos_user", fields: ["user_id", { name: "agreed_at", order: "DESC" }] },
    ],
  },
);

export default ModerationLog;
