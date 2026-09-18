/**
 * FAQ types.
 *
 * ── Why one table and not three ─────────────────────────────────────────────
 * The marketing site, the mobile Help screen and the admin console each carried
 * their own hardcoded FAQ list, and the three had drifted: the site answered
 * "What will it cost?", the app answered "What happens after I file a report?",
 * and the console showed a third set that appeared nowhere. An editor had no way
 * to change any of them.
 *
 * They are one kind of thing — a question with an answer — so they are one
 * table, and `surfaces` decides where each entry appears. That is what lets an
 * editor write "Can I post anonymously?" once and publish it to both, while a
 * pre-launch pricing question stays on the website where it makes sense.
 */

/** Where an entry is shown. An entry with an empty list appears nowhere. */
export type FaqSurface = "app" | "website";

export const ALL_FAQ_SURFACES: FaqSurface[] = ["app", "website"];

/**
 * Draft entries are invisible to both public surfaces.
 *
 * Lowercase on the wire, like every other status in this API. The console maps
 * these to "Draft" / "Published" for display, the same way it does for contact
 * inquiry statuses.
 */
export type FaqStatus = "draft" | "published";

export const ALL_FAQ_STATUSES: FaqStatus[] = ["draft", "published"];

// ─────────────────────────────────────────────────────────────────────────────
// Public wire shapes — what the app and the website render
// ─────────────────────────────────────────────────────────────────────────────

export interface FaqCategoryView {
  id: string;
  label: string;
}

export interface FaqItemView {
  id: string;
  categoryId: string;
  question: string;
  answer: string;
  /** Surfaced before the reader searches or picks a category. */
  startHere?: boolean;
}

/**
 * The payload both public surfaces consume.
 *
 * Categories are filtered to those that actually have a visible entry — an
 * empty category chip is a dead end, and which categories are empty depends on
 * the surface being asked for.
 */
export interface FaqPayload {
  categories: FaqCategoryView[];
  items: FaqItemView[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Console wire shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row in the console table.
 *
 * Carries the editorial fields the public view drops — status, surfaces, sort
 * order and the last-edited stamp — because those are exactly what an editor is
 * there to manage.
 */
export interface FaqAdminView {
  id: string;
  question: string;
  answer: string;
  categoryId: string;
  /** Denormalised for the table, so the console needs one call, not two. */
  categoryLabel: string;
  status: FaqStatus;
  surfaces: FaqSurface[];
  startHere: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface FaqSummary {
  total: number;
  published: number;
  draft: number;
}

export interface FaqListParams {
  page: number;
  limit: number;
  search?: string;
  status?: FaqStatus;
  categoryId?: string;
  surface?: FaqSurface;
}

export interface CreateFaqDto {
  question: string;
  answer: string;
  categoryId: string;
  status?: FaqStatus;
  surfaces?: FaqSurface[];
  startHere?: boolean;
  sortOrder?: number;
}

/** Every field optional — a PATCH names only what it changes. */
export type UpdateFaqDto = Partial<CreateFaqDto>;
