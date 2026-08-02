PYTRADE CLERK SETUP
===================

Architecture
------------

Clerk is the authentication provider. PostgreSQL keeps the existing PyTrade
user as the durable application identity. The two records have a one-to-one
link through users.clerk_user_id.

Clerk owns:
  - email and password authentication
  - email verification and invitations
  - sessions, password recovery, and account bans
  - a copy of the role used only to show the admin menu immediately

PostgreSQL owns:
  - the internal user UUID
  - role and application status
  - SnapTrade identifiers and secrets
  - accounts and all financial records

Passwords and sessions are never copied into PostgreSQL. Accounts continue to
reference users.id, so moving away from Clerk later does not require rewriting
financial ownership.


1. Create the Clerk application
-------------------------------

1. Sign in at https://dashboard.clerk.com and create an application.
2. Enable Email address and Password authentication.
3. Leave MFA strategies disabled for now.
4. Under User & authentication > User model > User permissions, turn off
   Allow users to delete their accounts. This keeps Clerk's Manage account UI
   consistent with PyTrade's soft-disable-only policy.
5. Under User & authentication > Restrictions, enable Restricted mode.
   This prevents public registration. Only invited or manually created users
   can complete the embedded PyTrade sign-up flow.
6. Keep email subaddresses allowed if you want to use +clerk_test accounts.


2. Configure the project environment file
-----------------------------------------

Copy `.env.example` to `.env` at the repository root, then store the development
configuration there. Add
the publishable and secret keys from Clerk's API Keys page alongside the
existing DATABASE_URL:

  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_replace_me
  CLERK_SECRET_KEY=sk_test_replace_me

The web app, Fastify API, database tooling, sync packages, and import scripts
all load this single file. Never commit the populated `.env` file.

Install the declared workspace dependencies after pulling these changes:

  pnpm install


3. Apply the schema migration
-----------------------------

Back up the database, then run:

  pnpm db:migrate

The migration adds nullable clerk_user_id and email columns plus an application
status. It does not modify or delete existing accounts or financial records.


4. Create and link the initial admin yourself
---------------------------------------------

The first administrator must be bootstrapped once because no linked admin
exists yet to open PyTrade's /admin/users page.

1. In Clerk, open Users and select Create user.
2. Enter your email and choose a password.
3. Open the newly created user's detail page.
4. Open Metadata and set Public metadata to exactly:

     { "role": "admin" }

5. Save it and copy the Clerk user ID. It starts with user_.
6. Link that identity to the existing PyTrade admin row:

     pnpm auth:link-admin -- --clerk-user-id=user_REPLACE_ME --email=YOUR_EMAIL

The command updates only the existing user named admin. Its internal UUID,
SnapTrade values, accounts, transactions, positions, holdings, and balances
remain unchanged. If the existing username is different, append:

     --username=EXISTING_USERNAME

After this bootstrap, routine user creation happens inside PyTrade through
User menu > Manage users.


5. Start and verify
-------------------

  pnpm dev

1. Visit http://localhost:3000/sign-in and sign in as the admin.
2. Open the user menu. Clerk supplies the user identity, Manage account, Manage
   users, and Sign out items.
3. Open Manage users and enter an email, PyTrade username, and role.
4. PyTrade creates a pending local user and Clerk sends the invitation.
5. The recipient follows the invitation to PyTrade's /sign-up page and creates
   their password through Clerk's embedded SignUp component.
6. On the first authenticated API request, PyTrade links the verified Clerk
   identity to the pending local user and activates it.
7. Disabling a user bans the Clerk identity, revokes its sessions, and marks the
   local user disabled. Financial data remains untouched.

PyTrade intentionally exposes no user-deletion endpoint. If an invitation
request fails, it removes only the brand-new pending row created by that same
failed request; it never deletes an existing or linked application user.


Production checklist
--------------------

1. Create or activate a Clerk production instance.
2. Enable Restricted mode, keep MFA disabled, and disable user self-deletion.
3. Configure the production domain and authorized origins in Clerk.
4. Set the production Clerk keys in both deployed services.
5. Set NEXT_PUBLIC_APP_URL to the public HTTPS URL.
6. Set API_BASE_URL to the public Fastify API URL.
7. Set WEB_ORIGIN on the API to the exact public web origin.
8. Apply the database migration after taking a backup.
9. Create the production admin, set { "role": "admin" }, and run
   auth:link-admin against the production database.


Test accounts
-------------

In a Clerk development instance, addresses containing +clerk_test can use the
verification code 424242 without consuming a real mailbox, for example:

  demo+clerk_test_admin@example.com
  demo+clerk_test_user@example.com
