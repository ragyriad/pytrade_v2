import { DividendsPage } from "../pages/dividendsPage";
import { fetchPortfolioDashboardFromBackend } from "../repositories/dashboard";
import { fetchDividendSummaryFromBackend } from "../repositories/dividends";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = await Promise.all([
      fetchPortfolioDashboardFromBackend(),
      fetchDividendSummaryFromBackend({ timeline: "ALL" }),
    ])
    .then(([dashboard, initialSummary]) => ({ dashboard, initialSummary }))
    .catch((caught) => ({
      error: caught instanceof Error ? caught.message : "Unable to load dividends.",
    }));

  if ("error" in result) {
    return <RouteError label="Dividends unavailable" error={result.error} />;
  }

  return <DividendsPage dashboard={result.dashboard} initialSummary={result.initialSummary} />;
}

function RouteError({ label, error }: { label: string; error: string }) {
  return <main className="app-main"><div className="app-page"><section className="app-panel mx-auto max-w-5xl border-negative p-5 text-center sm:p-6"><p className="text-sm font-medium text-negative">{label}</p><h1 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">API data could not be loaded.</h1><p className="mt-3 break-words text-sm text-muted">{error}</p></section></div></main>;
}
