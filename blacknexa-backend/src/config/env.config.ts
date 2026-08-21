/**
 * Environment configuration with fail-fast validation.
 *
 * Every variable the server needs is declared in one Joi schema and validated
 * before anything else boots. A missing or malformed value aborts the process
 * with a readable list of problems rather than surfacing later as a runtime
 * crash or, worse, a silently insecure default.
 *
 * No secret is ever hardcoded here — only non-sensitive defaults (ports,
 * window sizes, cron expressions).
 */

import path from "path";
import dotenv from "dotenv";
import Joi from "joi";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

export type NodeEnv = "development" | "test" | "production";
export type StorageDriver = "db" | "s3";

/** Shape of the validated configuration exposed to the rest of the app. */
export interface AppEnv {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  publicApiOrigin: string;
  publicSiteOrigin: string;
  trustProxy: boolean | number;

  database: {
    url?: string;
    host?: string;
    port?: number;
    name?: string;
    user?: string;
    password?: string;
    ssl: boolean;
    poolMax: number;
    poolMin: number;
    logging: boolean;
    sync: boolean;
    syncAlter: boolean;
  };

  corsOrigins: string[];

  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  bcryptSaltRounds: number;
  bcryptDummyHash: string;
  ai: {
    toolkitUrl: string;
    secretKey: string;
    /** True when generation/translation calls can actually be made. */
    enabled: boolean;
  };

  /**
   * The Python AI news engine. When `url` and `token` are set, the news AI paths
   * delegate to it; otherwise the in-process implementation is used, so adopting
   * or rolling back the engine is a config change rather than a deploy.
   */
  aiEngine: {
    url: string;
    /** A signing secret (preferred, tokens are then short-lived) or a static token. */
    token: string;
    timeoutMs: number;
    tokenTtlSeconds: number;
    issuer: string;
    audience: string;
    enabled: boolean;
  };

  jobs: {
    enableCron: boolean;
    dailyNewsCron: string;
    platformMaintenanceCron: string;
    enableSearchEnginePing: boolean;
  };

  rateLimit: {
    windowMs: number;
    max: number;
    authMax: number;
    writeMax: number;
    readMax: number;
  };

  storage: {
    driver: StorageDriver;
    maxUploadBytes: number;
    s3Region: string;
    s3Bucket: string;
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
    s3Endpoint?: string;
    presignExpiresSeconds: number;
  };

  adminBootstrap: {
    email?: string;
    password?: string;
  };

  logLevel: string;
}

/** Parse a comma-separated list into trimmed, non-empty entries. */
function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * `TRUST_PROXY` accepts `true`/`false` or a hop count, mirroring what Express
 * itself accepts, so a deployment behind two proxies can say `2`.
 */
function parseTrustProxy(raw: string | undefined): boolean | number {
  if (!raw) return false;
  const lowered = raw.toLowerCase();
  if (lowered === "true") return true;
  if (lowered === "false") return false;
  const hops = Number.parseInt(raw, 10);
  return Number.isFinite(hops) && hops >= 0 ? hops : false;
}

const schema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  PORT: Joi.number().port().default(4000),
  PUBLIC_API_ORIGIN: Joi.string().uri().allow("").default(""),
  PUBLIC_SITE_ORIGIN: Joi.string().uri().default("https://blacknexa.com"),
  TRUST_PROXY: Joi.string().allow("").default("false"),

  // Either DATABASE_URL, or the discrete DB_* set. Enforced below.
  DATABASE_URL: Joi.string().allow("").default(""),
  DB_HOST: Joi.string().allow("").default(""),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().allow("").default(""),
  DB_USER: Joi.string().allow("").default(""),
  DB_PASSWORD: Joi.string().allow("").default(""),
  DB_SSL: Joi.boolean().truthy("true").falsy("false").default(false),
  DB_POOL_MAX: Joi.number().integer().min(1).default(10),
  DB_POOL_MIN: Joi.number().integer().min(0).default(0),
  DB_LOGGING: Joi.boolean().truthy("true").falsy("false").default(false),
  DB_SYNC: Joi.boolean().truthy("true").falsy("false").default(false),
  DB_SYNC_ALTER: Joi.boolean().truthy("true").falsy("false").default(false),

  CORS_ORIGINS: Joi.string().allow("").default(""),

  JWT_ACCESS_SECRET: Joi.string().min(32).required().messages({
    "any.required": "JWT_ACCESS_SECRET is required",
    "string.min": "JWT_ACCESS_SECRET must be at least 32 characters",
  }),
  JWT_REFRESH_SECRET: Joi.string().min(32).required().messages({
    "any.required": "JWT_REFRESH_SECRET is required",
    "string.min": "JWT_REFRESH_SECRET must be at least 32 characters",
  }),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default("7d"),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(15).default(12).messages({
    "number.min": "BCRYPT_SALT_ROUNDS must be at least 10",
  }),
  BCRYPT_DUMMY_HASH: Joi.string()
    .default("$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva"),
  SERVER_ENCRYPTION_SECRET: Joi.string().allow("").default(""),

  AI_TOOLKIT_URL: Joi.string().uri().allow("").default("https://toolkit.rork.com"),
  AI_TOOLKIT_SECRET_KEY: Joi.string().allow("").default(""),
  // Accepted for drop-in parity with the Worker's injected env names.
  EXPO_PUBLIC_TOOLKIT_URL: Joi.string().uri().allow("").default(""),
  EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY: Joi.string().allow("").default(""),

  // ── Python AI news engine (optional) ──────────────────────────────────────
  AI_ENGINE_URL: Joi.string().uri().allow("").default(""),
  AI_ENGINE_TOKEN: Joi.string().allow("").default(""),
  // Generous: a deep synthesis runs search + a 7200-token completion + image
  // generation in one call, and the engine's own per-call budget can stack.
  AI_ENGINE_TIMEOUT_MS: Joi.number().integer().min(1000).max(300_000).default(90_000),
  AI_ENGINE_TOKEN_TTL_SECONDS: Joi.number().integer().min(60).max(86_400).default(900),
  AI_ENGINE_ISSUER: Joi.string().default("blacknexa-backend"),
  AI_ENGINE_AUDIENCE: Joi.string().default("blacknexa-ai-engine"),

  ENABLE_CRON: Joi.boolean().truthy("true").falsy("false").default(false),
  CRON_DAILY_NEWS: Joi.string().default("0 6 * * *"),
  CRON_PLATFORM_MAINTENANCE: Joi.string().default("* * * * *"),
  ENABLE_SEARCH_ENGINE_PING: Joi.boolean().truthy("true").falsy("false").default(false),

  RATE_LIMIT_WINDOW_MS: Joi.number().integer().min(1000).default(900_000),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(300),
  RATE_LIMIT_AUTH_MAX: Joi.number().integer().min(1).default(8),
  RATE_LIMIT_WRITE_MAX: Joi.number().integer().min(1).default(30),
  RATE_LIMIT_READ_MAX: Joi.number().integer().min(1).default(600),

  STORAGE_DRIVER: Joi.string().valid("db", "s3").default("db"),
  MAX_UPLOAD_BYTES: Joi.number().integer().min(1024).default(10 * 1024 * 1024),
  S3_REGION: Joi.string().allow("").default("us-east-1"),
  S3_BUCKET: Joi.string().allow("").default(""),
  S3_ACCESS_KEY_ID: Joi.string().allow("").default(""),
  S3_SECRET_ACCESS_KEY: Joi.string().allow("").default(""),
  S3_ENDPOINT: Joi.string().uri().allow("").default(""),
  S3_PRESIGN_EXPIRES_SECONDS: Joi.number().integer().min(60).max(604800).default(900),

  // `tlds: { allow: false }` validates the address format without requiring an
  // IANA-registered TLD, so an internal ops address (admin@company.internal,
  // ops@blacknexa.test) is accepted.
  ADMIN_BOOTSTRAP_EMAIL: Joi.string()
    .email({ tlds: { allow: false } })
    .allow("")
    .default(""),
  ADMIN_BOOTSTRAP_PASSWORD: Joi.string().min(12).allow("").default(""),

  LOG_LEVEL: Joi.string()
    .valid("error", "warn", "info", "http", "debug")
    .default("info"),
})
  .unknown(true)
  // A database connection must be resolvable one way or the other.
  .custom((value, helpers) => {
    const hasUrl = Boolean(value.DATABASE_URL);
    const hasDiscrete = Boolean(value.DB_HOST && value.DB_NAME && value.DB_USER);
    if (!hasUrl && !hasDiscrete) {
      return helpers.message({
        custom:
          "Database is not configured: set DATABASE_URL, or all of DB_HOST, DB_NAME and DB_USER",
      });
    }
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      return helpers.message({
        custom: "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values",
      });
    }
    if (value.NODE_ENV === "production") {
      if (!value.PUBLIC_API_ORIGIN) {
        return helpers.message({
          custom: "PUBLIC_API_ORIGIN is required in production so generated media URLs are absolute",
        });
      }
      const origins = parseList(value.CORS_ORIGINS);
      if (origins.length === 0) {
        return helpers.message({
          custom: "CORS_ORIGINS is required in production — a wildcard origin is not permitted",
        });
      }
      if (origins.includes("*")) {
        return helpers.message({
          custom: "CORS_ORIGINS must not contain '*' in production",
        });
      }
      if (value.DB_SYNC) {
        return helpers.message({
          custom: "DB_SYNC must be false in production — use a migration instead",
        });
      }
    }
    if (value.STORAGE_DRIVER === "s3") {
      const missing = ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter(
        (k) => !value[k],
      );
      if (missing.length > 0) {
        return helpers.message({
          custom: `STORAGE_DRIVER=s3 requires ${missing.join(", ")}`,
        });
      }
    }
    if (Boolean(value.ADMIN_BOOTSTRAP_EMAIL) !== Boolean(value.ADMIN_BOOTSTRAP_PASSWORD)) {
      return helpers.message({
        custom: "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must be set together",
      });
    }
    return value;
  });

const { value: raw, error } = schema.validate(process.env, {
  abortEarly: false,
  convert: true,
  stripUnknown: false,
});

if (error) {
  const details = error.details.map((d) => `  • ${d.message}`).join("\n");
  // Written straight to stderr: the logger itself depends on this config.
  process.stderr.write(
    `\n[env] Invalid environment configuration — refusing to start:\n${details}\n\n` +
    `Copy .env.example to .env and fill in the required values.\n\n`,
  );
  process.exit(1);
}

const nodeEnv = raw.NODE_ENV as NodeEnv;

export const env: AppEnv = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: raw.PORT,
  publicApiOrigin: (raw.PUBLIC_API_ORIGIN || "").replace(/\/+$/, ""),
  publicSiteOrigin: (raw.PUBLIC_SITE_ORIGIN as string).replace(/\/+$/, ""),
  trustProxy: parseTrustProxy(raw.TRUST_PROXY),

  database: {
    url: raw.DATABASE_URL || undefined,
    host: raw.DB_HOST || undefined,
    port: raw.DB_PORT,
    name: raw.DB_NAME || undefined,
    user: raw.DB_USER || undefined,
    password: raw.DB_PASSWORD || undefined,
    ssl: raw.DB_SSL,
    poolMax: raw.DB_POOL_MAX,
    poolMin: raw.DB_POOL_MIN,
    logging: raw.DB_LOGGING,
    sync: raw.DB_SYNC,
    syncAlter: raw.DB_SYNC_ALTER,
  },

  corsOrigins: parseList(raw.CORS_ORIGINS),

  jwt: {
    accessSecret: raw.JWT_ACCESS_SECRET,
    refreshSecret: raw.JWT_REFRESH_SECRET,
    accessExpiresIn: raw.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: raw.JWT_REFRESH_EXPIRES_IN,
  },
  bcryptSaltRounds: raw.BCRYPT_SALT_ROUNDS,
  bcryptDummyHash: raw.BCRYPT_DUMMY_HASH,
  ai: {
    // The Worker read EXPO_PUBLIC_* names; both are accepted so an existing
    // deployment's secrets can be reused verbatim.
    toolkitUrl:
      raw.AI_TOOLKIT_URL || raw.EXPO_PUBLIC_TOOLKIT_URL || "https://toolkit.rork.com",
    secretKey: raw.AI_TOOLKIT_SECRET_KEY || raw.EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY || "",
    enabled: Boolean(
      (raw.AI_TOOLKIT_URL || raw.EXPO_PUBLIC_TOOLKIT_URL) &&
      (raw.AI_TOOLKIT_SECRET_KEY || raw.EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY),
    ),
  },

  aiEngine: {
    url: (raw.AI_ENGINE_URL || "").replace(/\/+$/, ""),
    token: raw.AI_ENGINE_TOKEN || "",
    timeoutMs: raw.AI_ENGINE_TIMEOUT_MS,
    tokenTtlSeconds: raw.AI_ENGINE_TOKEN_TTL_SECONDS,
    issuer: raw.AI_ENGINE_ISSUER,
    audience: raw.AI_ENGINE_AUDIENCE,
    enabled: Boolean(raw.AI_ENGINE_URL && raw.AI_ENGINE_TOKEN),
  },

  jobs: {
    enableCron: raw.ENABLE_CRON,
    dailyNewsCron: raw.CRON_DAILY_NEWS,
    platformMaintenanceCron: raw.CRON_PLATFORM_MAINTENANCE,
    enableSearchEnginePing: raw.ENABLE_SEARCH_ENGINE_PING,
  },

  rateLimit: {
    windowMs: raw.RATE_LIMIT_WINDOW_MS,
    max: raw.RATE_LIMIT_MAX,
    authMax: raw.RATE_LIMIT_AUTH_MAX,
    writeMax: raw.RATE_LIMIT_WRITE_MAX,
    readMax: raw.RATE_LIMIT_READ_MAX,
  },

  storage: {
    driver: raw.STORAGE_DRIVER as StorageDriver,
    maxUploadBytes: raw.MAX_UPLOAD_BYTES,
    s3Region: raw.S3_REGION,
    s3Bucket: raw.S3_BUCKET,
    s3AccessKeyId: raw.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: raw.S3_SECRET_ACCESS_KEY,
    s3Endpoint: raw.S3_ENDPOINT || undefined,
    presignExpiresSeconds: raw.S3_PRESIGN_EXPIRES_SECONDS,
  },

  adminBootstrap: {
    email: raw.ADMIN_BOOTSTRAP_EMAIL || undefined,
    password: raw.ADMIN_BOOTSTRAP_PASSWORD || undefined,
  },

  logLevel: raw.LOG_LEVEL,
};

export default env;
