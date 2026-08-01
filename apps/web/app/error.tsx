"use client";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="app-main">
      <div className="app-page">
        <section className="app-panel mx-auto max-w-5xl border-negative p-5 text-center sm:p-6">
          <p className="text-sm font-medium text-negative">Page unavailable</p>
          <h1 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">Something failed while loading.</h1>
          <p className="mt-3 break-words text-sm text-muted">{error.message}</p>
          <div className="mt-5 flex justify-center">
            <button type="button" onClick={reset} className="rounded-md bg-primary-700 px-4 py-2 text-sm font-semibold text-on-primary transition hover:bg-primary-800">
              Try again
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
