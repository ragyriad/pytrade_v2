import Link from "next/link";
import { notFound } from "next/navigation";
import { requireApplicationAdmin } from "../../../lib/clerkAdmin";
import { CreateUserPage } from "../../../pages/createUserPage";

export const dynamic = "force-dynamic";

export default async function NewAdminUserPage() {
  const authorization = await requireApplicationAdmin();
  if (!authorization.ok) notFound();

  return (
    <main className="app-main">
      <div className="app-page max-w-4xl">
        <header className="mb-6">
          <Link
            href="/admin/users"
            className="inline-flex min-h-10 items-center rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground"
          >
            ← Back to users
          </Link>
          <h1 className="mt-6 text-2xl font-semibold text-foreground sm:text-3xl">Create user</h1>
        </header>
        <CreateUserPage />
      </div>
    </main>
  );
}
