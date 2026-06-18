# AI Context — PyTrade

## Overview

PyTrade is an investment data platform that aggregates and normalizes financial account data, primarily using SnapTrade. The system is designed to ingest, persist, and process financial data for downstream analytics and application use.

The architecture is modular, with separation between:

* Data ingestion (SnapTrade + external APIs)
* Persistence (database via Drizzle ORM)
* Processing (jobs / workers)
* Application layer (future APIs / UI)

---

## Core Stack

* Language: TypeScript (Node.js)
* Monorepo: Turborepo + pnpm
* ORM: Drizzle ORM
* Data Source: SnapTrade (primary), potential public APIs later
* Database: Relational (exact DB not specified, likely PostgreSQL)

---

## Key Concepts

### 1. SnapTrade Integration

SnapTrade is the primary provider for:

* Account data
* Holdings
* Transactions

Important constraints:

* Data is fetched via sync processes
* External data may be inconsistent or delayed
* Requires normalization before persistence

---

### 2. Persistence Layer

The system uses Drizzle ORM for schema definitions and DB access.

Design principles:

* Schemas are defined in a dedicated `/schemas` directory
* A central index file aggregates and exports all schemas
* A separate DB driver file initializes the connection

Current challenge:

* Deciding how to structure a proper persistence layer for:

  * Jobs
  * Data ingestion scripts
  * Sync processes

---

### 3. Data Flow (Critical)

High-level pipeline:

1. External Fetch

   * SnapTrade API returns raw financial data

2. Transformation

   * Normalize into internal format
   * Handle inconsistencies / missing data

3. Persistence

   * Store into database via Drizzle
   * Maintain referential integrity (FKs, relationships)

4. Processing (Jobs)

   * Background jobs enrich or update data
   * Examples:

     * Sync accounts
     * Update holdings
     * Reconcile transactions

---

### 4. Jobs / Workers

Jobs are responsible for:

* Fetching data from SnapTrade
* Updating the database
* Running periodically or on demand

Open design question:

* How to structure job runners vs reusable data-access logic

---

### 5. Schema Design Patterns

* Strong use of foreign keys (e.g., FolderRSN relationships mentioned)
* Potential issues with:

  * Incorrect data from external migrations
  * Need for cleanup / correction scripts

---

### 6. Known Problems / Constraints

* External data inconsistency (SnapTrade + migrations)
* Need for scripts to fix relational data issues
* Separation of concerns between:

  * DB access
  * Business logic
  * Job execution

---

## Architectural Goals

* Clean separation between ingestion, persistence, and processing
* Reusable data-access layer (not tightly coupled to jobs)
* Scalable job system for syncing financial data
* Ability to audit and fix bad data

---

## Conventions for AI Assistance

When helping with this project:

1. Prefer:

   * Clear separation of layers (repo/service/job)
   * Type-safe DB access patterns
   * Idempotent job design

2. Avoid:

   * Mixing DB logic directly inside job runners
   * Tight coupling to SnapTrade response formats
   * One-off scripts without reuse potential

3. Assume:

   * Data can be inconsistent or partially missing
   * Sync operations may run multiple times
   * Database integrity is critical

---

## What I Need Help With Often

* Designing persistence/repository layers
* Structuring jobs and background workers
* Writing safe migration / data-fix scripts
* Debugging relational data issues
* Optimizing data ingestion pipelines

---

## Current Focus

* Building a proper persistence layer
* Designing job architecture for syncing SnapTrade data
* Ensuring database integrity across syncs and migrations

---

## How to Respond

* Be concise but technical
* Suggest architecture, not just code
* Call out tradeoffs explicitly
* Prefer scalable patterns over quick hacks
* Assume this will grow into a production system
