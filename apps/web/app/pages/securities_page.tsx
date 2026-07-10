import { SecuritiesDashboard } from "../components/portfolio/securities-dashboard";
import { fetchHistoricSecuritiesFromBackend } from "../api-layer/securities";
import type { HistoricSecurityDto } from "../lib/portfolio-types";

type PageProps = {
  searchParams?: {
    userId?: string;
  };
};

export async function SecuritiesPage({ searchParams }: PageProps) {
  let securities: HistoricSecurityDto[] | null = null;
  let error: string | null = null;

  try {
    const response = await fetchHistoricSecuritiesFromBackend(searchParams?.userId);
    securities = response.securities;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Unable to load securities data.";
  }

  if (error || !securities) {
    return (
      <main className="app-main p-6 sm:p-10">
        <div className="app-panel mx-auto max-w-5xl border-negative p-6 text-center">
          <p className="text-sm font-medium text-negative">Securities unavailable</p>
          <p className="mt-3 text-sm text-muted">{error}</p>
        </div>
      </main>
    );
  }

  return <SecuritiesDashboard securities={securities} userId={searchParams?.userId} />;
}
