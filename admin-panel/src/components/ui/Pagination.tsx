/**
 * The pagination footer.
 *
 * Markup and classes come from the prototype. Two things are added: the page
 * numbers are windowed so a large result set does not render three hundred
 * buttons, and the control is a <nav> with a live region so that a screen reader
 * hears which page it landed on.
 */

import { useMemo } from "react";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Plural noun for the count line, e.g. "staff accounts". */
  itemLabel?: string;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100] as const;

/** How many numbered buttons to show around the current page. */
const WINDOW = 2;

/**
 * Page numbers to render, with `null` standing for a gap.
 *
 * Always includes the first and last page so the ends of the range stay
 * reachable in one click no matter how far in the operator has paged.
 */
function pageWindow(current: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages]);
  for (let p = current - WINDOW; p <= current + WINDOW; p++) {
    if (p > 1 && p < totalPages) pages.add(p);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZES,
  itemLabel = "records",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = useMemo(() => pageWindow(page, totalPages), [page, totalPages]);

  // An empty result set still shows the footer, so the range reads "0 to 0".
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav className="pagination-bar" aria-label="Pagination">
      <div className="pagination-left-info">
        <span aria-live="polite">
          Showing <strong>{first}</strong> to <strong>{last}</strong> of{" "}
          <strong>{total}</strong> {itemLabel}
        </span>

        <label className="pagination-size-label">
          <span className="sr-only">Records per page</span>
          <select
            className="page-size-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="page-btn"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </button>

        {pages.map((p, index) =>
          p === null ? (
            // Presentational: the gap is visual, and announcing "ellipsis"
            // between page numbers is noise.
            <span key={`gap-${index}`} className="page-gap" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`page-btn${p === page ? " active" : ""}`}
              {...(p === page ? { "aria-current": "page" as const } : {})}
              aria-label={`Page ${p}`}
              onClick={() => onPageChange(p)}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          className="page-btn"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export default Pagination;
