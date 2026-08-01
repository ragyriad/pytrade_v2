"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";
import { Button } from "../ui/button";

export type CalendarDisplayEvent = {
  id: string;
  date: string;
  symbol: string;
  type: string;
  typeLabel: string;
  title: string;
  details: string[];
  providerSource: string;
};

interface CalendarEventsCalendarProps {
  events: CalendarDisplayEvent[];
  title: string;
  subtitle: string;
  emptyMessage: string;
  monthsAtOnce?: 1 | 2;
}

type CalendarCell = {
  key: string;
  day: number | null;
  dateKey: string | null;
};

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fallbackStyle = {
  bg: "bg-calendar-default-surface",
  border: "border-calendar-default-border",
  text: "text-calendar-default-text",
  badge: "bg-calendar-default-badge text-calendar-default-text",
  dot: "bg-calendar-default-dot",
};
const eventStyles: Record<string, typeof fallbackStyle> = {
  earnings: {
    bg: "bg-calendar-earnings-surface",
    border: "border-calendar-earnings-border",
    text: "text-calendar-earnings-text",
    badge: "bg-calendar-earnings-badge text-calendar-earnings-text",
    dot: "bg-calendar-earnings-dot",
  },
  "dividend-ex": {
    bg: "bg-calendar-dividend-ex-surface",
    border: "border-calendar-dividend-ex-border",
    text: "text-calendar-dividend-ex-text",
    badge: "bg-calendar-dividend-ex-badge text-calendar-dividend-ex-text",
    dot: "bg-calendar-dividend-ex-dot",
  },
  "dividend-payment": {
    bg: "bg-calendar-payment-surface",
    border: "border-calendar-payment-border",
    text: "text-calendar-payment-text",
    badge: "bg-calendar-payment-badge text-calendar-payment-text",
    dot: "bg-calendar-payment-dot",
  },
  "dividend-record": {
    bg: "bg-calendar-record-surface",
    border: "border-calendar-record-border",
    text: "text-calendar-record-text",
    badge: "bg-calendar-record-badge text-calendar-record-text",
    dot: "bg-calendar-record-dot",
  },
  "dividend-declaration": {
    bg: "bg-calendar-declaration-surface",
    border: "border-calendar-declaration-border",
    text: "text-calendar-declaration-text",
    badge: "bg-calendar-declaration-badge text-calendar-declaration-text",
    dot: "bg-calendar-declaration-dot",
  },
};

function eventStyle(type: string) {
  return eventStyles[type] ?? fallbackStyle;
}

function parseDateKey(dateKey: string) {
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
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
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
    cells.push({
      key: `${monthKey}:blank:${cells.length}`,
      day: null,
      dateKey: null,
    });
  }

  return cells;
}

export function CalendarEventsCalendar({
  events,
  title,
  subtitle,
  emptyMessage,
  monthsAtOnce = 2,
}: CalendarEventsCalendarProps) {
  const [visibleStartMonth, setVisibleStartMonth] = useState(currentMonthKey);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarDisplayEvent[]>();
    for (const event of events) {
      grouped.set(event.date, [...(grouped.get(event.date) ?? []), event]);
    }
    grouped.forEach((rows, key) => {
      grouped.set(
        key,
        [...rows].sort(
          (a, b) =>
            a.typeLabel.localeCompare(b.typeLabel) ||
            a.symbol.localeCompare(b.symbol)
        )
      );
    });
    return grouped;
  }, [events]);
  const monthKeys = useMemo(
    () =>
      Array.from({ length: monthsAtOnce }, (_, index) =>
        addMonths(visibleStartMonth, index)
      ),
    [monthsAtOnce, visibleStartMonth]
  );
  const visibleMonths = new Set(monthKeys);
  const visibleEventCount = events.filter((event) =>
    visibleMonths.has(monthKeyFromDateKey(event.date))
  ).length;
  const visibleRangeLabel =
    monthKeys.length === 1
      ? monthLabel(monthKeys[0])
      : `${monthLabel(monthKeys[0])} – ${monthLabel(monthKeys.at(-1)!)}`;
  const legend = Array.from(
    new Map(
      events.map((event) => [event.type, event.typeLabel] as const)
    ).entries()
  );

  return (
    <section className="app-panel p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
          {legend.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Event types">
              {legend.map(([type, label]) => {
                const style = eventStyle(type);
                return (
                  <span
                    key={type}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${style.bg} ${style.border} ${style.text}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setVisibleStartMonth((month) =>
                addMonths(month, -monthsAtOnce)
              )
            }
            className="h-9 px-3"
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
            <span className="sr-only">Previous month</span>
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
            onClick={() =>
              setVisibleStartMonth((month) =>
                addMonths(month, monthsAtOnce)
              )
            }
            className="h-9 px-3"
          >
            <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
            <span className="sr-only">Next month</span>
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

      {events.length === 0 ? (
        <div className="mt-5 flex min-h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
          {emptyMessage}
        </div>
      ) : (
        <div
          className={`mt-5 grid gap-5 ${
            monthsAtOnce === 2 ? "xl:grid-cols-2" : ""
          }`}
        >
          {monthKeys.map((monthKey) => (
            <article
              key={monthKey}
              className="overflow-x-auto rounded-md border border-border bg-surface"
            >
              <div className="min-w-[760px]">
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
                    const dayEvents = cell.dateKey
                      ? eventsByDate.get(cell.dateKey) ?? []
                      : [];

                    return (
                      <div
                        key={cell.key}
                        className={`min-h-32 border-b border-r border-border p-2 ${
                          cell.day == null
                            ? "bg-surface-muted"
                            : "bg-surface"
                        }`}
                      >
                        {cell.day == null ? null : (
                          <>
                            <div className="mb-1.5 text-right text-xs font-semibold text-muted">
                              {cell.day}
                            </div>
                            <div className="space-y-1.5">
                              {dayEvents.map((event) => {
                                const style = eventStyle(event.type);
                                return (
                                  <article
                                    key={event.id}
                                    className={`rounded border p-2 ${style.bg} ${style.border} ${style.text}`}
                                  >
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span
                                        className={`h-2 w-2 rounded-full ${style.dot}`}
                                      />
                                      <span className="text-xs font-extrabold">
                                        {event.symbol}
                                      </span>
                                      <span
                                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none ${style.badge}`}
                                      >
                                        {event.typeLabel}
                                      </span>
                                    </div>
                                    <p className="mt-1.5 break-words text-[11px] font-semibold leading-snug">
                                      {event.title}
                                    </p>
                                    {event.details.map((detail) => (
                                      <p
                                        key={detail}
                                        className="mt-1 break-words text-[10px] font-medium leading-snug opacity-90"
                                      >
                                        {detail}
                                      </p>
                                    ))}
                                    <p className="mt-1.5 break-all text-[9px] font-semibold uppercase opacity-70">
                                      Source: {event.providerSource}
                                    </p>
                                  </article>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
