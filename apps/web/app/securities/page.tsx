import { SecuritiesDashboard } from "../components/portfolio/securities-dashboard";
import { fetchHistoricSecuritiesFromBackend } from "../lib/api";
import type { HistoricSecurityDto } from "../lib/portfolio-types";

type PageProps = {
  searchParams?: {
    userId?: string;
  };
};

export const dynamic = "force-dynamic";

export default async function SecuritiesPage({ searchParams }: PageProps) {
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
      <main className="min-h-screen bg-zinc-50 p-6 text-zinc-950 sm:p-10">
        <div className="mx-auto max-w-5xl rounded-md border border-rose-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-rose-700">Securities unavailable</p>
          <p className="mt-3 text-sm text-zinc-600">{error}</p>
        </div>
      </main>
    );
  }

  return <SecuritiesDashboard securities={securities} userId={searchParams?.userId} />;
}
