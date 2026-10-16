# PyTrade reusable demo data

## Purpose

The `full` demo profile creates a realistic, repeatable portfolio and ensures
that its application user is active and linked to an existing Clerk identity.
It is intended for demos, screenshots, UI testing,
and future development—not as a one-time database dump.

The profile currently contains:

- 26 underlying US and Canadian stocks and ETFs.
- 5 accounts: TFSA, RRSP, USD margin, cash, and credit card.
- 22 current positions and current account balances.
- Two years of buys, sells, CAD and USD dividends in every account,
  withholding taxes, fees, payroll, interest, purchases, card charges, and
  card payments.
- Daily historical values for every account, ending at the current account
  balance so performance calculations and charts are immediately populated.
- 6 option contracts covering open, closed, and expired states.
- Upcoming earnings and dividend calendar events.
- Current price snapshots for all 26 underlyings.

Diversification groups exist only inside the generator catalog to produce a
varied portfolio. They are not written as an `industry` field, do not require a
schema migration, and are not exposed by the application.

## Commands

Create the demo identity in Clerk first, then configure its Clerk `user_...`
ID. Clerk's External ID is not used by PyTrade:

```text
DEMO_USERNAME=demouser
DEMO_CLERK_USER_ID=user_REPLACE_ME
DEMO_USER_EMAIL=demo@example.com
```

If `demouser` does not exist locally, `demo:seed` creates it with the `user`
role and `active` status. If it already exists without a Clerk link, the
command links and activates it. It refuses to overwrite a different existing
Clerk link or reuse a Clerk ID/email owned by another application user.

Preview without writing anything:

```text
pnpm demo:seed -- --username=demouser --profile=full --dry-run
```

Create or replace the selected user's demo profile:

```text
pnpm demo:seed -- --username=demouser --profile=full
```

Create a reproducible snapshot with an explicit date and random seed:

```text
pnpm demo:seed -- --username=demouser --profile=full --as-of=2026-08-02 --seed=conference-demo
```

Preview a reset:

```text
pnpm demo:reset -- --username=demouser --dry-run
```

Remove the selected user's replaceable demo profile:

```text
pnpm demo:reset -- --username=demouser
```

If `--as-of` is omitted, the command uses the current UTC date. If `--seed` is
omitted, it uses `pytrade-demo-v1`. Supplying both explicitly is recommended
for screenshots and repeatable demonstrations.

## Replacement and data safety

The seed command first removes only accounts whose JSON metadata identifies
the selected user as their DEMO owner. Account-owned balances, positions, and
transactions are removed through their existing database cascades. It also
removes only calendar events whose DEMO provider ID begins with that user's
application ID.

The command does not delete or modify the user's ordinary accounts or imported
activity. It does not create the Clerk identity; that identity must already
exist in Clerk. The corresponding PyTrade application user is created or
activated automatically using `DEMO_CLERK_USER_ID`.

Matching securities are reused by stable security key or by listing identity
(symbol, currency, and exchange). Missing securities are added. Security,
option-contract, and price-reference rows are deliberately retained by reset
because they are shared catalog data and may be reused by other profiles.

Calendar API results are scoped to securities associated with the signed-in
user's accounts. DEMO calendar events receive an additional owner check so a
second user holding the same symbol cannot see another demo user's generated
events.

## Generator structure

```text
packages/db/src/demo/
|-- catalog/
|   `-- securities.ts          26-security input catalog
|-- scenarios/
|   `-- fullPortfolio.ts       Pure deterministic profile generator
|-- cli.ts                     seed/reset command-line entry point
|-- user.ts                    Demo user provisioning and Clerk linkage
|-- persistence.ts             Transactional replacement and reuse rules
|-- random.ts                  Seeded random and stable ID helpers
`-- types.ts                   Scenario and report types

packages/db/test/unit/
`-- demo-scenario.test.ts      Pure generator coverage and safety tests
```

Keeping generation pure makes the scenario fast to test and easy to extend.
Database writes stay in a separate persistence layer, and the CLI is only an
orchestrator. A future `compact`, `retirement`, or `options-heavy` profile can
reuse the same catalog, random helpers, persistence rules, and command shape.
