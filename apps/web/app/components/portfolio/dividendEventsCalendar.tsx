import { formatMoney } from "../../lib/formatters";
import type { DividendCalendarEventDto } from "../../lib/portfolioTypes";
import {
  CalendarEventsCalendar,
  type CalendarDisplayEvent,
} from "./calendarEventsCalendar";

type DividendEventsCalendarProps = {
  events: DividendCalendarEventDto[];
};

function buildDividendCalendarItems(
  events: DividendCalendarEventDto[]
): CalendarDisplayEvent[] {
  return events.flatMap((event) => {
    const amount = `${formatMoney(event.cashAmount)} per share`;
    const sharedDetails = [
      amount,
      event.frequency ? `Frequency: ${event.frequency}` : null,
      event.isSpecial ? "Special distribution" : null,
    ].filter((detail): detail is string => Boolean(detail));
    const items: CalendarDisplayEvent[] = [
      {
        id: `${event.id}:ex`,
        date: event.exDate,
        symbol: event.symbol,
        type: "dividend-ex",
        typeLabel: "Dividend ex-date",
        title: "Dividend ex-date",
        details: sharedDetails,
        providerSource: event.source,
      },
    ];

    if (event.paymentDate) {
      items.push({
        id: `${event.id}:payment`,
        date: event.paymentDate,
        symbol: event.symbol,
        type: "dividend-payment",
        typeLabel: "Dividend payment",
        title: "Dividend payment date",
        details: sharedDetails,
        providerSource: event.source,
      });
    }

    return items;
  });
}

export function DividendEventsCalendar({
  events,
}: DividendEventsCalendarProps) {
  return (
    <CalendarEventsCalendar
      events={buildDividendCalendarItems(events)}
      title="Dividend calendar"
      subtitle="Stored dividend ex-date and payment events"
      emptyMessage="No dividend events match this view."
      monthsAtOnce={1}
      stateKey="dividends"
    />
  );
}
