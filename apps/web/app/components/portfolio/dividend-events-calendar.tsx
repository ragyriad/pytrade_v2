"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { formatDate, formatMoney } from "../../lib/formatters";
import type { DividendCalendarEventDto } from "../../lib/portfolio-types";
import { Button } from "../ui/button";

type DividendEventsCalendarProps = {
  events: DividendCalendarEventDto[];
};

type CalendarCell = {
  key: string;
  day: number | null;
  dateKey: string | null;
};

type CalendarEventKind = "ex-date" | "payment";

type DividendCalendarItem = DividendCalendarEventDto & {
  calendarId: string;
  eventDate: string;
  eventKind: CalendarEventKind;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const eventStyles = [
  {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-900",
    dot: "bg-emerald-600",
  },
  {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-900",
    dot: "bg-sky-600",
  },
  {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-900",
    dot: "bg-violet-600",
  },
  {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
    dot: "bg-amber-600",
  },
  {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-900",
    dot: "bg-rose-600",
  },
  {
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-900",
    dot: "bg-cyan-600",
  },
];

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function monthKeyFromDateKey(dateKey: string): string {
  const { year, month } = parseDateKey(dateKey);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(monthKey: string, offset: number): string {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthLabel(monthKey: string): string {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function buildMonthCells(monthKey: string): CalendarCell[] {
  const { year, month } = parseDateKey(`${monthKey}-01`);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarCell[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `${monthKey}:blank:${index}`, day: null, dateKey: null });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = dateKey(year, month, day);
    cells.push({ key, day, dateKey: key });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `${monthKey}:blank:${cells.length}`, day: null, dateKey: null });
  }

  return cells;
}

function symbolHash(symbol: string): number {
  return symbol
    .split("")
    .reduce((hash, char) => hash + char.charCodeAt(0), 0);
}

function eventStyle(event: Pick<DividendCalendarEventDto, "symbol">) {
  return eventStyles[symbolHash(event.symbol) % eventStyles.length];
}

function buildCalendarItems(events: DividendCalendarEventDto[]): DividendCalendarItem[] {
  return events.flatMap((event) => {
    const items: DividendCalendarItem[] = [
      {
        ...event,
        calendarId: `${event.id}:ex-date`,
        eventDate: event.exDate,
        eventKind: "ex-date",
      },
    ];

    if (event.paymentDate) {
      items.push({
        ...event,
        calendarId: `${event.id}:payment`,
        eventDate: event.paymentDate,
        eventKind: "payment",
      });
    }

    return items;
  });
}

export function DividendEventsCalendar({ events }: DividendEventsCalendarProps) {
  const [visibleStartMonth, setVisibleStartMonth] = useState(currentMonthKey);
  const calendarItems = useMemo(() => buildCalendarItems(events), [events]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, DividendCalendarItem[]>();

    for (const item of calendarItems) {
      grouped.set(item.eventDate, [...(grouped.get(item.eventDate) ?? []), item]);
    }

    grouped.forEach((rows, key) => {
      grouped.set(
        key,
        [...rows].sort(
          (a, b) =>
            b.cashAmount.amount - a.cashAmount.amount ||
            a.symbol.localeCompare(b.symbol) ||
            a.eventKind.localeCompare(b.eventKind)
        )
      );
    });

    return grouped;
  }, [calendarItems]);
  const monthKeys = useMemo(
    () => [visibleStartMonth, addMonths(visibleStartMonth, 1)],
    [visibleStartMonth]
  );
  const visibleEventCount = useMemo(() => {
    const visibleMonths = new Set(monthKeys);
    return calendarItems.filter((item) =>
      visibleMonths.has(monthKeyFromDateKey(item.eventDate))
    ).length;
  }, [calendarItems, monthKeys]);
  const visibleRangeLabel = `${monthLabel(monthKeys[0])} - ${monthLabel(monthKeys[1])}`;

  return (
    <section className="app-panel p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Dividend calendar</h2>
          <p className="mt-1 text-sm text-muted">
            Stored dividend ex-date and payment events
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleStartMonth((month) => addMonths(month, -2))}
            className="h-9 px-3"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
            <span className="sr-only">Previous two months</span>
          </Button>
          <div className="min-w-52 rounded-md border border-border bg-surface-muted px-3 py-2 text-center text-sm font-semibold text-foreground">
            {visibleRangeLabel}
            <span className="ml-2 text-xs font-medium text-muted">
              {visibleEventCount} events
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleStartMonth((month) => addMonths(month, 2))}
            className="h-9 px-3"
          >
            <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
            <span className="sr-only">Next two months</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setVisibleStartMonth(currentMonthKey())}
            className="h-9 px-3"
          >
            Today
          </Button>
        </div>
      </div>

      {calendarItems.length === 0 ? (
        <div className="mt-5 flex min-h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
          No dividend events match this view.
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {monthKeys.map((monthKey) => (
            <article
              key={monthKey}
              className="overflow-hidden rounded-md border border-border bg-surface"
            >
              <div className="border-b border-border bg-surface-muted px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {monthLabel(monthKey)}
                </h3>
              </div>
              <div className="grid grid-cols-7 border-b border-border bg-surface-muted text-center text-[11px] font-semibold uppercase text-muted">
                {weekdayLabels.map((label) => (
                  <div key={label} className="px-2 py-2">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {buildMonthCells(monthKey).map((cell) => {
                  const dayEvents = cell.dateKey ? eventsByDate.get(cell.dateKey) ?? [] : [];

                  return (
                    <div
                      key={cell.key}
                      className={`min-h-28 border-b border-r border-border p-2 ${
                        cell.day == null ? "bg-surface-muted" : "bg-surface"
                      }`}
                    >
                      {cell.day == null ? null : (
                        <>
                          <div className="mb-1 text-right text-xs font-semibold text-muted">
                            {cell.day}
                          </div>
                          <div className="space-y-1">
                            {dayEvents.map((item) => {
                              const style = eventStyle(item);
                              const eventLabel =
                                item.eventKind === "payment" ? "Payment" : "Ex-date";
                              const title = [
                                item.symbol,
                                `${eventLabel}: ${formatDate(item.eventDate)}`,
                                `${formatMoney(item.cashAmount)} per share`,
                              ]
                                .filter(Boolean)
                                .join(" | ");

                              return (
                                <div
                                  key={item.calendarId}
                                  title={title}
                                  className={`rounded border px-2 py-1 ${style.bg} ${style.border} ${style.text}`}
                                >
                                  <div className="flex min-w-0 items-center gap-1.5">
                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                                    <span className="truncate text-[11px] font-bold">
                                      {item.symbol}
                                    </span>
                                    <span className="rounded bg-white/70 px-1 text-[9px] font-bold uppercase">
                                      {item.eventKind === "payment" ? "Pay" : "Ex"}
                                    </span>
                                    {item.isSpecial ? (
                                      <span className="rounded bg-white/70 px-1 text-[9px] font-bold uppercase">
                                        Special
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-0.5 truncate text-[10px] font-semibold opacity-90">
                                    {formatMoney(item.cashAmount)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
