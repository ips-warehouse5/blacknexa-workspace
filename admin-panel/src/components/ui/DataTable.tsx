/**
 * The list table.
 *
 * Every queue screen in the design is the same table with different columns, so
 * the shape is described by data and rendered once here. That keeps the loading,
 * empty and error states identical across screens without each one
 * reimplementing them — which is what usually goes wrong when a console grows.
 *
 * Loading renders skeleton rows rather than replacing the table with a spinner:
 * the header and column widths stay put, so the page does not jump when the data
 * lands.
 */

import type { ReactNode } from "react";

export interface Column<Row> {
  /** Stable identity for the column. */
  key: string;
  header: ReactNode;
  /** Cell content for a row. */
  render: (row: Row) => ReactNode;
  /** CSS width, passed straight through to the <th>. */
  width?: string;
  align?: "left" | "right" | "center";
  /** Extra class on the cell, e.g. `cell-truncate`. */
  cellClassName?: string;
}

export interface DataTableProps<Row> {
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  /** Stable React key per row. */
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown when there are no rows and nothing is wrong. */
  emptyMessage?: ReactNode;
  /** Minimum width before the table scrolls horizontally. */
  minWidth?: string;
  /** Fixed layout, so declared column widths are honoured. */
  fixedLayout?: boolean;
  /** Accessible name for the table. */
  caption?: string;
  onRowClick?: (row: Row) => void;
  /** Rows drawn while loading. Match the usual page size to avoid a jump. */
  skeletonRows?: number;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyMessage = "No records found.",
  minWidth = "820px",
  fixedLayout = true,
  caption,
  onRowClick,
  skeletonRows = 8,
}: DataTableProps<Row>) {
  const colCount = columns.length;

  /** One full-width cell, used by all three non-data states. */
  const stateRow = (content: ReactNode) => (
    <tr>
      <td colSpan={colCount} className="empty" style={{ padding: "36px", textAlign: "center" }}>
        {content}
      </td>
    </tr>
  );

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <table
        className="table"
        style={{ tableLayout: fixedLayout ? "fixed" : "auto", width: "100%", minWidth }}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}

        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={{
                  ...(col.width ? { width: col.width } : {}),
                  ...(col.align ? { textAlign: col.align } : {}),
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody {...(loading ? { "aria-busy": true } : {})}>
          {error
            ? stateRow(
                <>
                  <div style={{ marginBottom: onRetry ? 12 : 0 }}>{error}</div>
                  {onRetry ? (
                    <button type="button" className="btn outline" onClick={onRetry}>
                      Try again
                    </button>
                  ) : null}
                </>,
              )
            : loading
              ? Array.from({ length: skeletonRows }, (_, i) => (
                  <tr key={`skeleton-${i}`} aria-hidden="true">
                    {columns.map((col) => (
                      <td key={col.key}>
                        <span className="skeleton-line" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.length === 0
                ? stateRow(emptyMessage)
                : rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      {...(onRowClick
                        ? {
                            onClick: () => onRowClick(row),
                            style: { cursor: "pointer" },
                            tabIndex: 0,
                            onKeyDown: (e: React.KeyboardEvent) => {
                              if (e.key === "Enter") onRowClick(row);
                            },
                          }
                        : {})}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          {...(col.cellClassName ? { className: col.cellClassName } : {})}
                          {...(col.align ? { style: { textAlign: col.align } } : {})}
                        >
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
