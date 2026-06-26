"use client";

import { Fragment, type ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faChevronLeft,
  faChevronRight,
  faFilter,
  faSort,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/button";

export type TableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  value?: (row: T) => string | number | Date | null | undefined;
  enableFilter?: boolean;
  enableSorting?: boolean;
  render: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  title: string;
  rows: T[];
  columns: TableColumn<T>[];
  getRowKey: (row: T) => string;
  emptyMessage: string;
  isRowExpanded?: (row: T) => boolean;
  renderExpandedRow?: (row: T) => ReactNode;
};

export function DataTable<T>({
  title,
  rows,
  columns,
  getRowKey,
  emptyMessage,
  isRowExpanded,
  renderExpandedRow,
}: DataTableProps<T>) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 30,
  });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});

  const getColumnValue = (column: TableColumn<T>, row: T) => {
    const value = column.value?.(row) ?? column.render(row);
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      value instanceof Date
    ) {
      return value;
    }
    return "";
  };

  const formatFilterValue = (value: string | number | Date | null | undefined) => {
    if (value == null || value === "") return "-";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value);
  };

  const filterOptionsByColumn = useMemo(() => {
    return new Map(
      columns.map((column) => {
        const values = Array.from(
          new Set(rows.map((row) => formatFilterValue(getColumnValue(column, row))))
        ).sort((a, b) => a.localeCompare(b));

        return [column.key, values];
      })
    );
  }, [columns, rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      return columns.every((column) => {
        const selected = columnFilters[column.key];
        if (!selected || selected.length === 0) return true;

        return selected.includes(formatFilterValue(getColumnValue(column, row)));
      });
    });
  }, [columnFilters, columns, rows]);

  const columnDefs: ColumnDef<T>[] = columns.map((column) => ({
    id: column.key,
    accessorFn: (row) => getColumnValue(column, row),
    header: column.header,
    cell: ({ row }) => column.render(row.original),
    enableSorting: column.enableSorting ?? true,
  }));
  const alignByColumnId = new Map(columns.map((column) => [column.key, column.align]));

  const table = useReactTable({
    data: filteredRows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowKey,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      pagination,
      sorting,
    },
  });

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [filteredRows.length]);

  const alignClassName = (align?: "left" | "center" | "right") => {
    if (align === "right") return "text-right";
    if (align === "left") return "text-left";
    return "text-center";
  };

  const toggleFilterValue = (columnKey: string, value: string) => {
    setColumnFilters((current) => {
      const selected = current[columnKey] ?? [];
      const next = selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value];

      return {
        ...current,
        [columnKey]: next,
      };
    });
  };

  const clearColumnFilter = (columnKey: string) => {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[columnKey];
      return next;
    });
  };

  const hasActiveFilters = Object.values(columnFilters).some((values) => values.length > 0);

  return (
    <section className="rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{filteredRows.length} of {rows.length} rows</span>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={() => setColumnFilters({})}
              className="font-medium text-emerald-700 hover:text-emerald-800"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const align = alignByColumnId.get(header.column.id);

                  return (
                    <th
                      key={header.id}
                      className={`relative px-5 py-3 font-medium ${
                        alignClassName(align)
                      }`}
                    >
                      {header.isPlaceholder ? null : (
                        <div className={`flex items-center gap-2 ${
                          align === "right"
                            ? "justify-end"
                            : align === "left"
                              ? "justify-start"
                              : "justify-center"
                        }`}>
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-100"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            <FontAwesomeIcon
                              icon={
                                header.column.getIsSorted() === "asc"
                                  ? faArrowUp
                                  : header.column.getIsSorted() === "desc"
                                    ? faArrowDown
                                    : faSort
                              }
                              className="h-3 w-3 text-zinc-400"
                            />
                          </button>
                          {(columns.find((column) => column.key === header.column.id)?.enableFilter ?? true) ? (
                            <details className="group relative">
                              <summary className="inline-flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded hover:bg-zinc-100">
                                <FontAwesomeIcon
                                  icon={faFilter}
                                  className={`h-3 w-3 ${
                                    (columnFilters[header.column.id]?.length ?? 0) > 0
                                      ? "text-emerald-700"
                                      : "text-zinc-400"
                                  }`}
                                />
                              </summary>
                              <div className="absolute right-0 z-30 mt-2 max-h-72 w-56 overflow-auto rounded-md border border-zinc-200 bg-white p-2 text-left normal-case shadow-lg">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-zinc-500">
                                    Filter
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => clearColumnFilter(header.column.id)}
                                    className="text-xs font-medium text-emerald-700"
                                  >
                                    Clear
                                  </button>
                                </div>
                                {(filterOptionsByColumn.get(header.column.id) ?? []).map((value) => (
                                  <label
                                    key={value}
                                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(columnFilters[header.column.id] ?? []).includes(value)}
                                      onChange={() => toggleFilterValue(header.column.id, value)}
                                      className="h-3.5 w-3.5 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                                    />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </details>
                          ) : null}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-zinc-500" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => {
                const expanded = isRowExpanded?.(row.original) ?? false;
                const rowShade = rowIndex % 2 === 0 ? "bg-white" : "bg-zinc-50";

                return (
                  <Fragment key={row.id}>
                    <tr className={`${rowShade} transition-colors hover:bg-emerald-50/60`}>
                      {row.getVisibleCells().map((cell) => {
                        const align = alignByColumnId.get(cell.column.id);

                        return (
                          <td
                            key={cell.id}
                            className={`px-5 py-4 ${alignClassName(align)}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                    {renderExpandedRow ? (
                      <tr className={rowShade}>
                        <td className="p-0" colSpan={columns.length}>
                          <div
                            className={`grid transition-all duration-300 ease-in-out ${
                              expanded
                                ? "grid-rows-[1fr] opacity-100"
                                : "grid-rows-[0fr] opacity-0"
                            }`}
                          >
                            <div className="overflow-hidden">
                              {renderExpandedRow(row.original)}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-zinc-100 md:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-zinc-500">
            {emptyMessage}
          </div>
        ) : (
          table.getRowModel().rows.map((row, rowIndex) => {
            const expanded = isRowExpanded?.(row.original) ?? false;
            const rowShade = rowIndex % 2 === 0 ? "bg-white" : "bg-zinc-50";

            return (
              <Fragment key={row.id}>
                <article className={`${rowShade} px-4 py-3`}>
                  <dl className="grid gap-3">
                    {columns.map((column) => (
                      <div
                        key={column.key}
                        className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3"
                      >
                        <dt className="text-xs font-semibold uppercase text-zinc-500">
                          {column.header}
                        </dt>
                        <dd className="min-w-0 text-sm text-zinc-950">
                          {column.render(row.original)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
                {renderExpandedRow ? (
                  <div className={rowShade}>
                    <div
                      className={`grid transition-all duration-300 ease-in-out ${
                        expanded
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        {renderExpandedRow(row.original)}
                      </div>
                    </div>
                  </div>
                ) : null}
              </Fragment>
            );
          })
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-zinc-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-500">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
            Previous
          </Button>
          <select
            value={table.getState().pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm text-zinc-950 outline-none focus:border-emerald-600"
          >
            {[30, 50, 100].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {pageSize} rows
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </section>
  );
}
