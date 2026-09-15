/**
 * The API response envelope.
 *
 * The backend emits `{ success: 1 | 0, message, result }` for every route this
 * console calls. `success` is numeric rather than boolean — that is the
 * project's existing standard, and it is worth typing precisely so nobody
 * writes `if (body.success)` and has it pass on a `0`.
 */

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface ApiEnvelope<T> {
  success: 1 | 0;
  message: string;
  result: T;
  pagination?: Pagination;
  error?: string;
}

/** A page of rows plus its pagination block, as the list hooks return it. */
export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

/**
 * A failed request, normalised.
 *
 * Every rejection that reaches application code is one of these, so a caller
 * never has to tell an Axios error from a thrown string from a network drop.
 */
export class ApiError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;

  /**
   * Seconds until the caller may retry, from a `Retry-After` header.
   *
   * Set on a 429. The sign-in screen renders it as a lockout countdown, which
   * is why it is carried here rather than parsed out of the message text.
   */
  readonly retryAfterSeconds: number | undefined;

  /** Field-level messages, when the server sent them. */
  readonly fieldErrors: Record<string, string> | undefined;

  // Fields are assigned in the body rather than declared as constructor
  // parameter properties: `erasableSyntaxOnly` is on, and parameter properties
  // are TypeScript syntax that emits real code, so they are not erasable.
  constructor(
    message: string,
    status: number,
    retryAfterSeconds?: number,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.fieldErrors = fieldErrors;
  }

  /** The request never got a response — offline, DNS, CORS, or a dead server. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  /** Credentials are missing, expired, or were rejected. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Authenticated, but the role does not permit this. */
  get isForbidden(): boolean {
    return this.status === 403;
  }
}
