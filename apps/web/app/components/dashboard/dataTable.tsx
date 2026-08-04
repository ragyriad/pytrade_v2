"use client";

import { Fragment, type ReactNode } from "react";
import { useEffect, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
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
  faMagnifyingGlass,
  faSort,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/button";
import { DetailsDropdown } from "../ui/detailsDropdown";
import { useSessionState } from "../../state/sessionState";

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
  stateKey?: string;
  titleAccessory?: ReactNode;
  rows: T[];
  columns: TableColumn<T>[];
  getRowKey: (row: T) => string;
  emptyMessage: string;
  isRowExpanded?: (row: T) => boolean;
  renderExpandedRow?: (row: T) => ReactNode;
};

type TableSearchProps = {
  value: string;
  onChange: (value: string) => void;
};

function TableSearch({ value, onChange }: TableSearchProps) {
  return (
    <label className="relative block w-full min-w-0 sm:w-72">
      <span className="sr-only">Search rows</span>
      <FontAwesomeIcon
        icon={faMagnifyingGlass}
        className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        aria-label="Search rows"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search rows"
        className="app-control-focus h-9 w-full rounded-md border border-border bg-surface pl-9 pr-9 text-sm text-foreground outline-none transition placeholder:text-muted"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted hover:bg-interactive-surface hover:text-action-hover"
        >
          <span className="sr-only">Clear search</span>
          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
        </button>
      ) : null}
    </label>
  );
}

export function DataTable<T>({
  title,
  stateKey,
  titleAccessory,
  rows,
  columns,
  getRowKey,
  emptyMessage,
  isRowExpanded,
  renderExpandedRow,
}: DataTableProps<T>) {
  const [pagination, setPagination] = useSessionState<PaginationState>(
    stateKey ? `table:${stateKey}:pagination` : null,
    {
      pageIndex: 0,
      pageSize: 20,
    }
  );
  const [sorting, setSorting] = useSessionState<SortingState>(
    stateKey ? `table:${stateKey}:sorting` : null,
    []
  );
  const [columnFilters, setColumnFilters] = useSessionState<ColumnFiltersState>(
    stateKey ? `table:${stateKey}:column-filters` : null,
    []
  );
  const [globalFilter, setGlobalFilter] = useSessionState(
    stateKey ? `table:${stateKey}:search` : null,
    ""
  );

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

  const multiValueFilter: FilterFn<T> = (row, columnId, filterValue) => {
    const selectedValues = Array.isArray(filterValue) ? filterValue : [];
    if (selectedValues.length === 0) return true;

    return selectedValues.includes(
      formatFilterValue(row.getValue<string | number | Date | null | undefined>(columnId))
    );
  };

  const columnDefs: ColumnDef<T>[] = columns.map((column) => ({
    id: column.key,
    accessorFn: (row) => getColumnValue(column, row),
    header: column.header,
    cell: ({ row }) => column.render(row.original),
    enableSorting: column.enableSorting ?? true,
    enableColumnFilter: column.enableFilter ?? true,
    filterFn: multiValueFilter,
  }));
  const alignByColumnId = new Map(columns.map((column) => [column.key, column.align]));

  // TanStack Table returns mutable table APIs, so React Compiler correctly
  // opts this component out of memoization. The table remains safe to use.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: columnDefs,
    getCoreRowModel: getCoreRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: getRowKey,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      globalFilter,
      pagination,
      sorting,
    },
  });

  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const previousFilteredRowCount = useRef(filteredRowCount);

  useEffect(() => {
    if (previousFilteredRowCount.current !== filteredRowCount) {
      previousFilteredRowCount.current = filteredRowCount;
      setPagination((current) => ({ ...current, pageIndex: 0 }));
    }
  }, [filteredRowCount, setPagination]);

  const alignClassName = (align?: "left" | "center" | "right") => {
    if (align === "right") return "text-right";
    if (align === "left") return "text-left";
    return "text-center";
  };

  const toggleFilterValue = (columnKey: string, value: string) => {
    const column = table.getColumn(columnKey);
    const selected = (column?.getFilterValue() as string[] | undefined) ?? [];
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];

    column?.setFilterValue(next.length > 0 ? next : undefined);
  };

  const clearColumnFilter = (columnKey: string) => {
    table.getColumn(columnKey)?.setFilterValue(undefined);
  };

  const getColumnFilterValues = (columnId: string): string[] => {
    return (table.getColumn(columnId)?.getFilterValue() as string[] | undefined) ?? [];
  };

  const getColumnFilterOptions = (columnId: string): string[] => {
    const column = table.getColumn(columnId);
    if (!column) return [];

    return Array.from(
      new Set(
        Array.from(column.getFacetedUniqueValues().keys()).map((value) =>
          formatFilterValue(value as string | number | Date | null | undefined)
        )
      )
    ).sort((a, b) => a.localeCompare(b));
  };

  const hasActiveFilters =
    globalFilter.trim().length > 0 ||
    columnFilters.some((filter) => {
      return Array.isArray(filter.value) && filter.value.length > 0;
    });

  const clearFilters = () => {
    setColumnFilters([]);
    setGlobalFilter("");
  };

  return (
    <section className="app-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {titleAccessory}
          </div>
          <TableSearch value={globalFilter} onChange={setGlobalFilter} />
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>{filteredRowCount} of {rows.length} rows</span>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-action hover:text-action-hover"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-surface-muted text-xs uppercase text-muted">
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
                            className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-interactive-surface hover:text-action-strong"
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
                              className="h-3 w-3 text-muted"
                            />
                          </button>
                          {(columns.find((column) => column.key === header.column.id)?.enableFilter ?? true) ? (
                            <DetailsDropdown className="group relative">
                              <summary className="inline-flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded hover:bg-interactive-surface">
                                <FontAwesomeIcon
                                  icon={faFilter}
                                  className={`h-3 w-3 ${
                                    getColumnFilterValues(header.column.id).length > 0
                                      ? "text-action"
                                      : "text-muted"
                                  }`}
                                />
                              </summary>
                              <div className="absolute right-0 z-30 mt-2 max-h-72 w-60 overflow-auto rounded-md border border-border bg-surface p-2 text-left normal-case shadow-xl">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-muted">
                                    Filter
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => clearColumnFilter(header.column.id)}
                                    className="text-xs font-medium text-action"
                                  >
                                    Clear
                                  </button>
                                </div>
                                {getColumnFilterOptions(header.column.id).map((value) => (
                                  <label
                                    key={value}
                                    className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs transition ${
                                      getColumnFilterValues(header.column.id).includes(value)
                                        ? "bg-interactive-surface text-action-strong"
                                        : "text-foreground hover:bg-surface-muted"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={getColumnFilterValues(header.column.id).includes(value)}
                                      onChange={() => toggleFilterValue(header.column.id, value)}
                                      className="h-3.5 w-3.5 rounded border-border text-action focus:ring-focus"
                                    />
                                    <span className="truncate">{value}</span>
                                  </label>
                                ))}
                              </div>
                            </DetailsDropdown>
                          ) : null}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-center text-muted" colSpan={columns.length}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => {
                const expanded = isRowExpanded?.(row.original) ?? false;
                const rowShade = rowIndex % 2 === 0 ? "bg-surface" : "bg-surface-muted";

                return (
                  <Fragment key={row.id}>
                    <tr className={`${rowShade} transition-colors hover:bg-interactive-surface`}>
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
      <div className="divide-y divide-border md:hidden">
        {table.getRowModel().rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted">
            {emptyMessage}
          </div>
        ) : (
          table.getRowModel().rows.map((row, rowIndex) => {
            const expanded = isRowExpanded?.(row.original) ?? false;
            const rowShade = rowIndex % 2 === 0 ? "bg-surface" : "bg-surface-muted";

            return (
              <Fragment key={row.id}>
                <article className={`${rowShade} px-4 py-3 transition-colors active:bg-interactive-surface`}>
                  <dl className="grid gap-3">
                    {columns.map((column) => (
                      <div
                        key={column.key}
                        className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3"
                      >
                        <dt className="text-xs font-semibold uppercase text-muted">
                          {column.header}
                        </dt>
                        <dd className="min-w-0 text-sm text-foreground">
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
      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted">
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
            className="h-9 rounded-md border border-border bg-surface px-2 text-sm text-foreground outline-none focus:border-focus"
          >
            {[10, 20, 30, 50].map((pageSize) => (
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
