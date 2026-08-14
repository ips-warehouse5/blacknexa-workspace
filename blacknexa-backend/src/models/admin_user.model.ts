/**
 * `admin_users` — operators who can call the destructive/operational routes.
 *
 * This table is new. The Worker had no authentication at all, which meant
 * anyone who knew the URL could trigger `POST /news/refresh-daily`,
 * `POST /platform/persistence/restore`, or flip a payout to `succeeded`.
 *
 * This is the one entity where the spec's UUID-primary-key rule applies cleanly,
 * because no client round-trips the id. The UUID is assigned by a `beforeCreate`
 * hook, and the password is hashed with bcrypt (12 rounds by default, floor of
 * 10 enforced at env validation) in a `beforeSave` hook so a plaintext password
 * cannot reach the database even if a caller forgets to hash.
 */

import bcrypt from "bcryptjs";
import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";
import sequelize from "@/config/database.config";
import { SOFT_DELETE_OPTIONS } from "@/models/model_options";
import env from "@/config/env.config";
import { uuidv4 } from "@/utils/id.util";
import type { AdminRole } from "@/types/admin.interface";

export class AdminUser extends Model<
  InferAttributes<AdminUser>,
  InferCreationAttributes<AdminUser>
> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare name: string;
  /** bcrypt hash — never selected into a response. */
  declare password_hash: string;
  declare role: AdminRole;
  declare is_active: CreationOptional<boolean>;
  declare last_login_at: CreationOptional<string | null>;
  /** Current refresh-token id. Rotated on every refresh; null once logged out. */
  declare refresh_token_id: CreationOptional<string | null>;

  /** Constant-time comparison of a candidate password against the stored hash. */
  async verifyPassword(candidate: string): Promise<boolean> {
    if (!this.password_hash) return false;
    return bcrypt.compare(candidate, this.password_hash);
  }
}

AdminUser.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      allowNull: false,
      // Declarative fallback. The `beforeValidate` hook below is the primary
      // generator; this covers a raw `bulkCreate` that bypasses instance hooks.
      defaultValue: DataTypes.UUIDV4,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: "admin_users_email_unique",
      validate: { isEmail: true },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "",
    },
    password_hash: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "admin",
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    last_login_at: {
      type: DataTypes.STRING(32),
      allowNull: true,
    },
    refresh_token_id: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "AdminUser",
    tableName: "admin_users",
    ...SOFT_DELETE_OPTIONS,
    defaultScope: {
      // The hash is opt-in: it is only loaded when a query explicitly asks for
      // it (the login path), so it cannot leak through a careless response.
      attributes: { exclude: ["password_hash"] },
    },
    scopes: {
      withSecret: { attributes: { include: ["password_hash"] } },
    },
    hooks: {
      /**
       * `beforeValidate`, not `beforeCreate`.
       *
       * Sequelize runs validation *before* `beforeCreate`, so assigning the id
       * there is too late — `allowNull: false` on the primary key fails first.
       * This is the earliest hook that runs on both create and update.
       */
      beforeValidate(instance) {
        if (!instance.id) instance.id = uuidv4();
        // Normalising here covers create and update, so the unique index on email
        // cannot be sidestepped by a difference in casing or surrounding space.
        if (instance.email) instance.email = instance.email.trim().toLowerCase();
      },
      async beforeSave(instance) {
        // If a caller set a plaintext password, hash it before it hits the DB.
        // bcrypt hashes always start with $2a$/$2b$/$2y$ and are 60 chars.
        if (
          instance.changed("password_hash") &&
          instance.password_hash &&
          !/^\$2[aby]\$\d{2}\$.{53}$/.test(instance.password_hash)
        ) {
          instance.password_hash = await bcrypt.hash(
            instance.password_hash,
            env.bcryptSaltRounds,
          );
        }
      },
    },
    indexes: [{ name: "idx_admin_role", fields: ["role"] }],
  },
);

export default AdminUser;
