import {
  CalendarEventsCalendar,
  type CalendarDisplayEvent,
} from "../components/portfolio/calendarEventsCalendar";
import { formatDate, formatMoney, formatSource } from "../lib/formatters";
import type { CalendarEventDto } from "../lib/portfolioTypes";

function formatEps(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function providerDetails(event: CalendarEventDto): string[] {
  return event.providerTicker !== event.symbol
    ? [`Provider ticker: ${event.providerTicker}`]
    : [];
}

function dividendDetails(event: CalendarEventDto): string[] {
  return [
    event.cashAmount == null
      ? null
      : `${formatMoney({
          amount: event.cashAmount,
          currency: event.currencyCode ?? "USD",
        })} per share`,
    event.frequency ? `Frequency: ${event.frequency}` : null,
    event.distributionType
      ? `Distribution: ${event.distributionType}`
      : null,
    event.isSpecial ? "Special distribution" : null,
    ...providerDetails(event),
  ].filter((detail): detail is string => Boolean(detail));
}

function earningsDetails(event: CalendarEventDto): string[] {
  return [
    event.fiscalDateEnding
      ? `Fiscal period ending ${formatDate(event.fiscalDateEnding)}`
      : null,
    event.estimatedEps == null
      ? null
      : `Estimated EPS: ${formatEps(event.estimatedEps)} ${
          event.currencyCode ?? ""
        }`.trim(),
    event.reportedEps == null
      ? null
      : `Reported EPS: ${formatEps(event.reportedEps)} ${
          event.currencyCode ?? ""
        }`.trim(),
    event.eventStatus ? `Status: ${event.eventStatus}` : null,
    event.isEstimated ? "Expected date" : null,
    ...providerDetails(event),
  ].filter((detail): detail is string => Boolean(detail));
}

function toDisplayEvents(event: CalendarEventDto): CalendarDisplayEvent[] {
  const title = event.eventName ?? `${event.symbol} ${event.eventType}`;

  if (event.eventType === "earnings") {
    return [
      {
        id: event.id,
        date: event.eventDate,
        symbol: event.symbol,
        type: "earnings",
        typeLabel: "Earnings",
        title,
        details: earningsDetails(event),
        providerSource: formatSource(event.providerSource),
      },
    ];
  }

  if (event.eventType === "dividend") {
    const details = dividendDetails(event);
    const rows: CalendarDisplayEvent[] = [
      {
        id: `${event.id}:ex`,
        date: event.exDate ?? event.eventDate,
        symbol: event.symbol,
        type: "dividend-ex",
        typeLabel: "Dividend ex-date",
        title,
        details,
        providerSource: formatSource(event.providerSource),
      },
    ];
    const relatedDates = [
      {
        date: event.paymentDate,
        type: "dividend-payment",
        label: "Dividend payment",
        title: "Dividend payment date",
      },
      {
        date: event.recordDate,
        type: "dividend-record",
        label: "Dividend record",
        title: "Dividend record date",
      },
      {
        date: event.declarationDate,
        type: "dividend-declaration",
        label: "Dividend declared",
        title: "Dividend declaration date",
      },
    ];

    for (const related of relatedDates) {
      if (!related.date) continue;
      rows.push({
        id: `${event.id}:${related.type}`,
        date: related.date,
        symbol: event.symbol,
        type: related.type,
        typeLabel: related.label,
        title: related.title,
        details,
        providerSource: formatSource(event.providerSource),
      });
    }

    return rows;
  }

  return [
    {
      id: event.id,
      date: event.eventDate,
      symbol: event.symbol,
      type: event.eventType,
      typeLabel: formatSource(event.eventType),
      title,
      details: [
        event.eventStatus ? `Status: ${event.eventStatus}` : null,
        ...providerDetails(event),
      ].filter((detail): detail is string => Boolean(detail)),
      providerSource: formatSource(event.providerSource),
    },
  ];
}

type CalendarPageProps = {
  events: CalendarEventDto[];
};

export function CalendarPage({ events }: CalendarPageProps) {
  const displayEvents = events.flatMap(toDisplayEvents);
  const securityCount = new Set(
    events.map((event) => event.securityId).filter(Boolean)
  ).size;

  return (
    <main className="app-main">
      <div className="app-page">
        <header className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-wide text-action">
            Corporate events
          </p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">
                Calendar
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted">
                Earnings, dividend ex-dates, payment dates, record dates, and
                declaration dates from every stored calendar event.
              </p>
            </div>
            <div className="text-sm font-semibold text-muted">
              {events.length} source events · {displayEvents.length} dated
              entries · {securityCount} securities
            </div>
          </div>
        </header>

        <CalendarEventsCalendar
          events={displayEvents}
          title="All calendar events"
          subtitle="Event details are shown directly in each day—no hover required."
          emptyMessage="No calendar events have been imported."
          monthsAtOnce={1}
        />
      </div>
    </main>
  );
}
