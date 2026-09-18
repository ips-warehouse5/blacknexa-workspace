/**
 * FAQ shapes.
 *
 * Mirrors `types/faq.interface.ts` on the server. Status and surface are unions
 * rather than plain strings, so a badge or a filter for a value the API cannot
 * send is a compile error instead of an empty table.
 *
 * The wire uses lowercase (`published`), the console shows title case
 * ("Published") — the same split as the contact queue, and for the same reason:
 * the API's vocabulary should not be decided by what reads well in a pill.
 */

import type { BadgeTone } from "@/components/ui/Badge";

export const FAQ_STATUSES = ["draft", "published"] as const;
export type FaqStatus = (typeof FAQ_STATUSES)[number];

export const FAQ_STATUS_LABELS: Record<FaqStatus, string> = {
  draft: "Draft",
  published: "Published",
};

export const FAQ_STATUS_TONES: Record<FaqStatus, BadgeTone> = {
  draft: "draft",
  published: "published",
};

/**
 * Where an entry appears.
 *
 * This is the field that made one table out of three hardcoded lists: the
 * marketing site and the mobile Help screen answer different questions, and an
 * editor decides per entry which of them it belongs on.
 */
export const FAQ_SURFACES = ["app", "website"] as const;
export type FaqSurface = (typeof FAQ_SURFACES)[number];

export const FAQ_SURFACE_LABELS: Record<FaqSurface, string> = {
  app: "Mobile app",
  website: "Website",
};

export interface FaqCategory {
  id: string;
  label: string;
  sortOrder: number;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  categoryId: string;
  categoryLabel: string;
  status: FaqStatus;
  surfaces: FaqSurface[];
  startHere: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface FaqListParams {
  page: number;
  limit: number;
  search: string;
  /** "all" is the console's sentinel; the API never sees it. */
  status: FaqStatus | "all";
  categoryId: string | "all";
}

export interface FaqSummary {
  total: number;
  published: number;
  draft: number;
}

export interface CreateFaqInput {
  question: string;
  answer: string;
  categoryId: string;
  status: FaqStatus;
  surfaces: FaqSurface[];
  startHere: boolean;
}

export type UpdateFaqInput = Partial<CreateFaqInput>;
