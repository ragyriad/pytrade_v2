import { CalendarPage } from "../pages/calendarPage";
import { fetchCalendarEventsFromBackend } from "../repositories/calendar";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = await fetchCalendarEventsFromBackend()
    .then((events) => ({ events }))
    .catch((caught) => ({
      error: caught instanceof Error ? caught.message : "Unable to load calendar events.",
    }));

  if ("error" in result) {
    return <main className="app-main"><div className="app-page"><section className="app-panel mx-auto max-w-5xl border-negative p-5 text-center sm:p-6"><p className="text-sm font-medium text-negative">Calendar unavailable</p><h1 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">API data could not be loaded.</h1><p className="mt-3 break-words text-sm text-muted">{result.error}</p></section></div></main>;
  }

  return <CalendarPage events={result.events} />;
}
