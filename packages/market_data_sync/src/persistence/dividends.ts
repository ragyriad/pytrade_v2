import type { DB, NewCalendarEvent } from "@repo/db";
import type { ProviderDividendEvent, MarketDataSecurity } from "../shared/provider-types.js";
import {
  persistCalendarEvents,
  toNewCalendarEvent,
} from "./calendar-events.js";

export function toNewDividendEvent(
  event: ProviderDividendEvent,
  security: MarketDataSecurity
): NewCalendarEvent {
  return toNewCalendarEvent(event, security);
}

export async function persistDividendEvents(
  database: DB,
  security: MarketDataSecurity,
  events: ProviderDividendEvent[]
) {
  return persistCalendarEvents(database, security, events);
}
