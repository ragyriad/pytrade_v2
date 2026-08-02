import { notFound } from "next/navigation";
import { UserManagement } from "../../components/admin/userManagement";
import { listApplicationUsers, requireApplicationAdmin } from "../../lib/clerkAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const authorization = await requireApplicationAdmin();
  if (!authorization.ok) notFound();

  const { users, invitations } = await listApplicationUsers(authorization.client);
  return (
    <main className="app-main">
      <div className="app-page">
        <header className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-action">Administration</p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">User management</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Invite application users, assign roles, and disable access without deleting financial data.
          </p>
        </header>
        <UserManagement
          initialUsers={users}
          initialInvitations={invitations}
          currentUserId={authorization.userId}
        />
      </div>
    </main>
  );
}
