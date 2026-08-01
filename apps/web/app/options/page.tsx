import { OptionsPage } from "../pages/optionsPage";
import { fetchPortfolioDashboardFromBackend } from "../repositories/dashboard";

export const dynamic = "force-dynamic";

type PageProps = { searchParams?: { userId?: string } };

export default async function Page({ searchParams }: PageProps) {
  const result = await fetchPortfolioDashboardFromBackend(searchParams?.userId)
    .then((dashboard) => ({ dashboard }))
    .catch((caught) => ({
      error: caught instanceof Error ? caught.message : "Unable to load options.",
    }));

  if ("error" in result) {
    return <RouteError label="Options unavailable" error={result.error} />;
  }

  return <OptionsPage dashboard={result.dashboard} />;
}

function RouteError({ label, error }: { label: string; error: string }) {
  return <main className="app-main"><div className="app-page"><section className="app-panel mx-auto max-w-5xl border-negative p-5 text-center sm:p-6"><p className="text-sm font-medium text-negative">{label}</p><h1 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">API data could not be loaded.</h1><p className="mt-3 break-words text-sm text-muted">{error}</p></section></div></main>;
}
