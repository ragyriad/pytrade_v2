import { HomePage } from "./pages/homePage";
import { backendApiBaseUrl, fetchPortfolioDashboardFromBackend } from "./repositories/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const result = await fetchPortfolioDashboardFromBackend()
    .then((dashboard) => ({ dashboard }))
    .catch((caught) => ({
      error: caught instanceof Error ? caught.message : "Unable to load portfolio.",
    }));

  if ("error" in result) {
    return (
      <main className="app-main"><div className="app-page">
        <section className="app-panel mx-auto max-w-5xl border-negative p-5 text-center sm:p-6">
          <p className="text-sm font-medium text-negative">Portfolio unavailable</p>
          <h1 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">API data could not be loaded.</h1>
          <p className="mt-3 break-words text-sm text-muted">{result.error}</p>
          <p className="mt-5 text-sm text-muted">Expected API: <code>{backendApiBaseUrl}/api/portfolio/dashboard</code></p>
        </section>
      </div></main>
    );
  }

  return <HomePage dashboard={result.dashboard} />;
}
