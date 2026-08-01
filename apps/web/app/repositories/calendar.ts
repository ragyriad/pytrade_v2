import type { CalendarEventDto } from "../lib/portfolioTypes";
import { backendApiBaseUrl, fetchJson } from "./http-client";

type CalendarEventsResponse = {
  events: CalendarEventDto[];
};

export async function fetchCalendarEventsFromBackend(): Promise<
  CalendarEventDto[]
> {
  const response = await fetchJson<CalendarEventsResponse>(
    `${backendApiBaseUrl}/api/calendar/events`
  );
  return response.events;
}
