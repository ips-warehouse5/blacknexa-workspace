/**
 * Joi validation registry.
 *
 * `validate('schemaName')` resolves a name to a `{ body?, query?, params? }`
 * schema set. Keeping them in one registry means the full request contract of the
 * API is readable in a handful of files, and a route cannot accidentally ship
 * without validation — an unregistered name throws rather than passing input
 * through.
 *
 * **Every schema is written against what the shipped clients actually send.**
 * Where the Expo and iOS apps disagree with the old Worker (snake_case bodies,
 * query-param payloads), the schema accepts both spellings so no mobile change is
 * needed. Those cases are called out in `docs/MIGRATION_PLAN.md` §6.
 */

import type Joi from "joi";
import { newsSchemas } from "@/validations/news.validation";
import { geoLegalSchemas } from "@/validations/geo_legal.validation";
import { platformSchemas } from "@/validations/platform.validation";
import { enterpriseSchemas } from "@/validations/enterprise.validation";
import { adminSchemas } from "@/validations/admin.validation";
import { userAuthSchemas } from "@/validations/user_auth.validation";
import { reportSchemas } from "@/validations/report.validation";
import { moderationSchemas } from "@/validations/moderation.validation";

export type ValidationTarget = "body" | "query" | "params";

export type SchemaSet = Partial<Record<ValidationTarget, Joi.ObjectSchema>>;

export type SchemaRegistry = Record<string, SchemaSet>;

const registry: SchemaRegistry = {
  ...newsSchemas,
  ...geoLegalSchemas,
  ...platformSchemas,
  ...enterpriseSchemas,
  ...adminSchemas,
  ...userAuthSchemas,
  ...reportSchemas,
  ...moderationSchemas,
};

/** Look up a schema set by name. */
export function getSchema(name: string): SchemaSet | undefined {
  return registry[name];
}

/** All registered schema names — used by the startup self-check. */
export function registeredSchemaNames(): string[] {
  return Object.keys(registry).sort();
}

export default registry;
