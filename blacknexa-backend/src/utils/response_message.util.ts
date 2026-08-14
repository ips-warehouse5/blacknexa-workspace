/**
 * Dynamic user-facing message builder.
 *
 * `responseMessage(type, action, module)` composes consistent copy from a small
 * grammar instead of scattering literals across controllers, so wording stays
 * uniform and is translatable from one place.
 *
 *   responseMessage("success", "create", "Creator")  → "Creator created successfully."
 *   responseMessage("error",   "fetch",  "Article")  → "Failed to fetch article."
 *   responseMessage("notFound", undefined, "Payout") → "Payout not found."
 *   responseMessage("required", undefined, "userId") → "userId is required."
 */

export type MessageType =
  | "success"
  | "error"
  | "notFound"
  | "required"
  | "invalid"
  | "exists"
  | "unauthorized"
  | "forbidden"
  | "conflict";

export type MessageAction =
  | "create"
  | "update"
  | "delete"
  | "fetch"
  | "list"
  | "login"
  | "logout"
  | "refresh"
  | "process"
  | "validate"
  | "dispatch"
  | "generate"
  | "translate"
  | "restore"
  | "prune"
  | "drain"
  | "snapshot";

/** Past-participle form used in success copy. */
const SUCCESS_VERB: Record<MessageAction, string> = {
  create: "created",
  update: "updated",
  delete: "deleted",
  fetch: "fetched",
  list: "listed",
  login: "logged in",
  logout: "logged out",
  refresh: "refreshed",
  process: "processed",
  validate: "validated",
  dispatch: "dispatched",
  generate: "generated",
  translate: "translated",
  restore: "restored",
  prune: "pruned",
  drain: "drained",
  snapshot: "captured",
};

/** Infinitive form used in failure copy. */
const ERROR_VERB: Record<MessageAction, string> = {
  create: "create",
  update: "update",
  delete: "delete",
  fetch: "fetch",
  list: "list",
  login: "log in",
  logout: "log out",
  refresh: "refresh",
  process: "process",
  validate: "validate",
  dispatch: "dispatch",
  generate: "generate",
  translate: "translate",
  restore: "restore",
  prune: "prune",
  drain: "drain",
  snapshot: "capture",
};

/** Lowercase a module label for mid-sentence use, keeping acronyms intact. */
function midSentence(module: string): string {
  if (!module) return "resource";
  // "HBCU", "ToS", "PII" stay as-is; "Creator" becomes "creator".
  const isAcronym = module.length <= 4 && module === module.toUpperCase();
  return isAcronym ? module : module.charAt(0).toLowerCase() + module.slice(1);
}

/** Capitalise the first character without touching the rest. */
function sentenceStart(module: string): string {
  if (!module) return "Resource";
  return module.charAt(0).toUpperCase() + module.slice(1);
}

/**
 * Compose a message.
 *
 * @param type   Outcome category.
 * @param action Verb, required for `success` and `error`; ignored otherwise.
 * @param module Entity or field name, e.g. "Creator", "Article", "userId".
 */
export function responseMessage(
  type: MessageType,
  action?: MessageAction,
  module = "resource",
): string {
  switch (type) {
    case "success":
      return `${sentenceStart(module)} ${action ? SUCCESS_VERB[action] : "processed"} successfully.`;
    case "error":
      return `Failed to ${action ? ERROR_VERB[action] : "process"} ${midSentence(module)}.`;
    case "notFound":
      return `${sentenceStart(module)} not found.`;
    case "required":
      return `${module} is required.`;
    case "invalid":
      return `Invalid ${midSentence(module)}.`;
    case "exists":
      return `${sentenceStart(module)} already exists.`;
    case "unauthorized":
      return "Authentication is required to access this resource.";
    case "forbidden":
      return "You do not have permission to perform this action.";
    case "conflict":
      return `${sentenceStart(module)} conflicts with an existing record.`;
    default:
      return "Request processed.";
  }
}

export default responseMessage;
