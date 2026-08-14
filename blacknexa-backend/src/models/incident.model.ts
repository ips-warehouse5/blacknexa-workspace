/**
 * `incidents`, `evidence_packages`, `dispatch_audit` — the Rights Protection
 * toolkit's storage.
 *
 * These three tables are intentionally **not** `paranoid`.
 * `DELETE /api/v1/geo-legal/incident/:id` responds with
 * "Incident and all associated evidence permanently deleted (GDPR/CCPA
 * right-to-erasure)". Backing that with a soft delete would make the response a
 * false statement, so erasure is a genuine hard delete with cascade.
 *
 * `sealed_payload` holds a doubly-encrypted blob: the client seals it with a key
 * that never leaves the device, then the server re-seals that ciphertext with a
 * PBKDF2-derived AES-256-GCM key. Losing the database still does not reveal the
 * report text.
 */

import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import sequelize from "@/config/database.config";
import { BASE_OPTIONS } from "@/models/model_options";
import type { IncidentCategory } from "@/types/news.interface";

export class Incident extends Model<
  InferAttributes<Incident>,
  InferCreationAttributes<Incident>
> {
  declare id: string;
  declare user_id: string;
  declare country_code: string;
  declare category: IncidentCategory;
  /** Server-sealed envelope (JSON) or the raw client-sealed blob if re-sealing failed. */
  declare sealed_payload: string;
  declare server_encrypted: boolean;
  declare pii_scrubbed: boolean;
  /** "private" | "trusted" | "public" */
  declare privacy_level: string;
  declare created_at: string;
  declare dispatch_status: string;
  declare dispatch_audit_id: string | null;
}

Incident.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "anonymous",
    },
    country_code: {
      type: DataTypes.STRING(8),
      allowNull: false,
    },
    category: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    sealed_payload: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    server_encrypted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    pii_scrubbed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    privacy_level: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "private",
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    dispatch_status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
    dispatch_audit_id: {
      type: DataTypes.STRING(128),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Incident",
    tableName: "incidents",
    ...BASE_OPTIONS,
    indexes: [
      { name: "idx_incidents_user", fields: ["user_id"] },
      { name: "idx_incidents_country", fields: ["country_code"] },
    ],
  },
);

export class EvidencePackage extends Model<
  InferAttributes<EvidencePackage>,
  InferCreationAttributes<EvidencePackage>
> {
  declare id: string;
  declare incident_id: string;
  /** Client-sealed media blob — the server never holds the key to open it. */
  declare sealed_blob: string;
  declare media_type: string;
  declare content_hash: string;
  declare metadata_scrubbed: boolean;
  declare created_at: string;
}

EvidencePackage.init(
  {
    id: {
      type: DataTypes.STRING(128),
      primaryKey: true,
      allowNull: false,
    },
    incident_id: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    sealed_blob: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    media_type: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    content_hash: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: "",
    },
    metadata_scrubbed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "EvidencePackage",
    tableName: "evidence_packages",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_evidence_incident", fields: ["incident_id"] }],
  },
);

export class DispatchAudit extends Model<
  InferAttributes<DispatchAudit>,
  InferCreationAttributes<DispatchAudit>
> {
  declare id: string;
  declare incident_id: string;
  declare channel: string;
  declare agency_id: string;
  declare agency_name: string;
  declare portal_url: string;
  declare status: string;
  declare dispatched_at: string;
}

DispatchAudit.init(
  {
    id: {
      type: DataTypes.STRING(255),
      primaryKey: true,
      allowNull: false,
    },
    incident_id: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: "draft",
    },
    channel: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    agency_id: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    agency_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    portal_url: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "",
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "AUDIT_RECORDED",
    },
    dispatched_at: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "DispatchAudit",
    tableName: "dispatch_audit",
    ...BASE_OPTIONS,
    indexes: [{ name: "idx_dispatch_incident", fields: ["incident_id"] }],
  },
);

export default Incident;
