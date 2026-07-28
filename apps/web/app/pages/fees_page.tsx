import { FeesDashboard } from "../components/portfolio/fees-dashboard";
import { fetchPortfolioDashboardFromBackend } from "../repositories/dashboard";
import type { PortfolioDashboardDto } from "../lib/portfolio-types";

type PageProps = {
  searchParams?: {
    userId?: string;
  };
};

export async function FeesPage({ searchParams }: PageProps) {
  let dashboard: PortfolioDashboardDto | null = null;
  let error: string | null = null;

  try {
    dashboard = await fetchPortfolioDashboardFromBackend(searchParams?.userId);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load fees.";
  }

  if (error || !dashboard) {
    return (
      <main className="app-main p-6 sm:p-10">
        <div className="app-panel mx-auto max-w-5xl border-negative p-6 text-center">
          <p className="text-sm font-medium text-negative">Fees unavailable</p>
          <h1 className="mt-3 text-2xl font-semibold">API data could not be loaded.</h1>
          <p className="mt-3 text-sm text-muted">{error}</p>
        </div>
      </main>
    );
  }

  return <FeesDashboard dashboard={dashboard} />;
}
