/**
 * Sequelize instance for PostgreSQL.
 *
 * Replaces the Durable Objects' embedded SQLite. Every query in the service
 * layer goes through Sequelize with bind parameters — no string interpolation of
 * user input, which is what keeps the migrated SQL free of injection surface.
 * (The persistence engine does interpolate table names; those are checked
 * against a hard-coded allowlist first. See services/persistence.service.ts.)
 */

import { Sequelize } from "sequelize";
import env from "@/config/env.config";
import logger from "@/utils/logger.util";

const common = {
  dialect: "postgres" as const,
  logging: env.database.logging ? (msg: string) => logger.debug(msg) : false,
  pool: {
    max: env.database.poolMax,
    min: env.database.poolMin,
    acquire: 30_000,
    idle: 10_000,
  },
  define: {
    // Table and column names are declared explicitly on every model so the
    // schema matches the Durable Object tables one-for-one.
    underscored: true,
    freezeTableName: true,
  },
  dialectOptions: env.database.ssl
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {},
  // The DO stored every timestamp as an ISO-8601 string. Keeping DATE columns as
  // `timestamptz` and serialising to ISO in the model getters preserves the exact
  // wire format the mobile clients already parse.
  timezone: "+00:00",
};

export const sequelize = env.database.url
  ? new Sequelize(env.database.url, common)
  : new Sequelize(
      env.database.name as string,
      env.database.user as string,
      env.database.password,
      {
        ...common,
        host: env.database.host,
        port: env.database.port,
      },
    );

/** Verify connectivity. Called during boot so a bad DSN fails fast. */
export async function assertDatabaseConnection(): Promise<void> {
  await sequelize.authenticate();
  logger.info("[db] PostgreSQL connection established");
}

export default sequelize;
