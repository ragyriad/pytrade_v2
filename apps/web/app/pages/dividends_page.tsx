import { DividendsDashboard } from "../components/portfolio/dividends-dashboard";
import { fetchDividendSummaryFromBackend } from "../repositories/dividends";
import { fetchPortfolioDashboardFromBackend } from "../repositories/dashboard";
import type {
  DividendDashboardSummaryDto,
  PortfolioDashboardDto,
} from "../lib/portfolio-types";

type PageProps = {
  searchParams?: {
    userId?: string;
  };
};

export async function DividendsPage({ searchParams }: PageProps) {
  let dashboard: PortfolioDashboardDto | null = null;
  let dividendSummary: DividendDashboardSummaryDto | null = null;
  let error: string | null = null;

  try {
    [dashboard, dividendSummary] = await Promise.all([
      fetchPortfolioDashboardFromBackend(searchParams?.userId),
      fetchDividendSummaryFromBackend({
        userId: searchParams?.userId,
        timeline: "ALL",
      }),
    ]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load dividends.";
  }

  if (error || !dashboard || !dividendSummary) {
    return (
      <main className="app-main p-6 sm:p-10">
        <div className="app-panel mx-auto max-w-5xl border-negative p-6">
          <p className="text-sm font-medium text-negative">Dividends unavailable</p>
          <h1 className="mt-3 text-2xl font-semibold">API data could not be loaded.</h1>
          <p className="mt-3 text-sm text-muted">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <DividendsDashboard
      dashboard={dashboard}
      initialSummary={dividendSummary}
      userId={searchParams?.userId}
    />
  );
}
