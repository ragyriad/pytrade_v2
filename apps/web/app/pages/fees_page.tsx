import { FeesDashboard } from "../components/portfolio/fees-dashboard";
import { fetchPortfolioDashboardFromBackend } from "../api-layer/dashboard";
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
      <main className="min-h-screen bg-zinc-50 p-6 text-zinc-950 sm:p-10">
        <div className="mx-auto max-w-5xl rounded-md border border-rose-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-rose-700">Fees unavailable</p>
          <h1 className="mt-3 text-2xl font-semibold">API data could not be loaded.</h1>
          <p className="mt-3 text-sm text-zinc-600">{error}</p>
        </div>
      </main>
    );
  }

  return <FeesDashboard dashboard={dashboard} />;
}
