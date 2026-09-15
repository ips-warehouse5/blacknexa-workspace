/**
 * Search, filter and paginate a list held in memory.
 *
 * Every fixture-backed queue screen needs the same three things, and they
 * interact in ways that are easy to get subtly wrong — most often by leaving
 * the operator stranded on page 9 of a result set that now has two pages.
 * Doing it once here means that bug is fixed everywhere at the same time.
 *
 * This is for lists that are already loaded. A server-paged screen uses its
 * query hook instead; `AdminRolesPage` is the worked example.
 */

import { useMemo, useState } from "react";

export interface LocalTableOptions<Row> {
  rows: readonly Row[];
  /** Fields searched by the query box. */
  searchFields?: (row: Row) => (string | null | undefined)[];
  /** Extra predicates, e.g. one per filter dropdown. All must pass. */
  filters?: readonly ((row: Row) => boolean)[];
  /** Comparator applied after filtering. */
  sort?: ((a: Row, b: Row) => number) | undefined;
  initialPageSize?: number;
}

export interface LocalTableResult<Row> {
  /** The rows on the current page. */
  pageRows: Row[];
  /** Every row matching the filters, across all pages. */
  matchedRows: Row[];
  total: number;
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  search: string;
  setSearch: (value: string) => void;
}

export function useLocalTable<Row>({
  rows,
  searchFields,
  filters,
  sort,
  initialPageSize = 10,
}: LocalTableOptions<Row>): LocalTableResult<Row> {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const query = search.trim().toLowerCase();

  const matchedRows = useMemo(() => {
    let result = rows.filter((row) => {
      if (filters?.some((predicate) => !predicate(row))) return false;
      if (!query) return true;
      if (!searchFields) return true;
      return searchFields(row).some((field) => field?.toLowerCase().includes(query));
    });
    // Copied before sorting: `filter` already returns a new array, but a
    // no-filter path could otherwise sort the caller's array in place.
    if (sort) result = [...result].sort(sort);
    return result;
  }, [rows, filters, searchFields, query, sort]);

  const total = matchedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  /**
   * The page actually in effect.
   *
   * Filtering can shrink the result set below the current page — page 9 of a
   * list that now has two pages. Clamping here, during render, means the rows
   * and the page number the caller shows are derived from the same value on the
   * very first frame. Correcting it in an effect instead would paint one frame
   * of an empty table before snapping back.
   */
  const safePage = Math.min(page, totalPages);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return matchedRows.slice(start, start + pageSize);
  }, [matchedRows, safePage, pageSize]);

  return {
    pageRows,
    matchedRows,
    total,
    page: safePage,
    pageSize,
    setPage,
    setPageSize: (size) => {
      setPageSize(size);
      // A different page size makes the current page number meaningless.
      setPage(1);
    },
    search,
    setSearch: (value) => {
      setSearch(value);
      setPage(1);
    },
  };
}

export default useLocalTable;
