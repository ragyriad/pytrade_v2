import { notFound } from "next/navigation";
import { listApplicationUsers, requireApplicationAdmin } from "../../lib/clerkAdmin";
import { UserPage } from "../../pages/userPage";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const authorization = await requireApplicationAdmin();
  if (!authorization.ok) notFound();

  const result = await listApplicationUsers(authorization.client)
    .then(({ users }) => ({ users }))
    .catch((caught) => ({
      error: caught instanceof Error ? caught.message : "Unable to load users.",
    }));

  if ("error" in result) {
    return (
      <main className="app-main">
        <div className="app-page">
          <section className="app-panel mx-auto max-w-5xl border-negative p-5 text-center sm:p-6">
            <p className="text-sm font-medium text-negative">User management unavailable</p>
            <h1 className="mt-3 text-xl font-semibold text-foreground sm:text-2xl">User data could not be loaded.</h1>
            <p className="mt-3 break-words text-sm text-muted">{result.error}</p>
          </section>
        </div>
      </main>
    );
  }
  return (
    <main className="app-main">
      <div className="app-page">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">User management</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Review linked identities across PyTrade and Clerk, assign roles, and disable access without deleting financial data.
          </p>
        </header>
        <UserPage
          initialUsers={result.users}
          currentUserId={authorization.userId}
        />
      </div>
    </main>
  );
}
