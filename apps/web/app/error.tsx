"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="app-main p-6 sm:p-10">
      <div className="app-panel mx-auto max-w-5xl border-negative p-6 text-center">
        <p className="text-sm font-medium text-negative">Page unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold">Something failed while loading.</h1>
        <p className="mt-3 text-sm text-muted">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-md bg-primary-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
