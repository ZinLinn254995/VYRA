# VYRA SaaS Backend Architecture Decision

**Status:** Proposed for the first SaaS foundation increment  
**Date:** 2026-11-01  
**Related:** GitHub Issue #45

## Decision

Use **Supabase Auth + managed PostgreSQL** as VYRA's first customer identity and relational data platform, while retaining Vercel for the existing React SPA and serverless API routes.

This is the lowest-friction fit for the current TypeScript/React + Express/Vercel architecture: one managed service provides customer authentication and relational storage, and Postgres supports tenant isolation, immutable financial ledgers, transactions, unique idempotency constraints, and row-level security.

Do not introduce a payment provider or paid subscription enforcement in this increment.

## Why Supabase

- Auth and Postgres are integrated, so VYRA does not need to operate its own identity service.
- The current Supabase Free plan is listed at $0 and includes 50,000 monthly active users, 500 MB database size, 1 GB file storage, and 5 GB egress. It is suitable for development and early validation, not a production uptime guarantee.
- Free projects may be paused after one week of inactivity and the free tier has no included daily backups. Before onboarding paying customers, evaluate a paid plan, backups, restore procedures, and expected storage/egress costs.
- Supabase supports Postgres Row Level Security (RLS), allowing ownership to be enforced in the database rather than trusting browser filters.
- Existing Vercel API routes can verify bearer tokens and use a user-scoped database client without changing the application framework.

Official references:
- Pricing: https://supabase.com/pricing
- Free/paid plan limits: https://supabase.com/docs/guides/platform/billing-on-supabase
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Auth server-side guidance: https://supabase.com/docs/guides/auth/server-side
- Supabase JS client: https://supabase.com/docs/reference/javascript/introduction

## Authentication model for this SPA + API architecture

The current app is a React SPA, not a Next.js SSR application. Therefore:

1. Use `@supabase/supabase-js` in the browser for sign-in/sign-out and session refresh.
2. Send the current access token to VYRA API routes as `Authorization: Bearer <access_token>`.
3. Verify the token on the server with Supabase Auth (for example, `auth.getUser(accessToken)`). Never accept a client-supplied `user_id` as proof of identity.
4. For tenant-owned database operations, create a request-scoped Supabase client using the public/publishable key plus the verified user's bearer token. Let RLS enforce ownership.
5. Do not put a Supabase secret/service-role key in the browser, Vite `VITE_*` variables, source control, or API responses. Avoid service-role access for normal customer CRUD.
6. Keep authentication optional behind a safe feature flag until credentials and migrations are configured. Existing local-only workflow must continue to work during the migration.

Do not add `@supabase/ssr` merely by default: VYRA currently does not use a framework with server-rendered cookie sessions. Reassess only if the app moves to SSR.

## Data model direction

Use UUID primary keys and UTC timestamps. Every customer-owned row must have a non-null `user_id` referencing `auth.users(id)` (or a tenant membership relation if team workspaces are introduced later).

Planned tables, added in small migrations:

| Table | Purpose | Customer access |
|---|---|---|
| `profiles` | Display name and account preferences | Own row only |
| `projects` | Durable project metadata and workflow state | Own rows only |
| `assets` | Object-storage metadata, ownership, MIME type, size, checksum | Own rows only |
| `generation_jobs` | Generation lifecycle and idempotency key | Own rows only; no client status override |
| `provider_attempts` | Provider/model/request IDs, outcome and usage metadata | Read-only own summary; secrets excluded |
| `provider_cost_records` | Provider-reported actual USD cost and source evidence | Read-only own records |
| `credit_ledger_entries` | Immutable purchases, generation reservation/commit/release/refund, transfers and adjustments | Read-only own balance history |
| `credit_packages` | Server-defined credit quantities, prices and volume-discount rules | Read-only published offers |
| `credit_transfers` | Transfer reference, sender, recipient, amount, status and idempotency key | Read-only transfers involving the customer; no direct customer writes |
| `payment_events` | Verified purchase webhook event IDs and processing state | No direct customer writes |

The first migration should start with the minimum required tables and RLS policies; do not create unused payment tables before a payment provider is selected. VYRA's current product direction is pay-as-you-go credit purchases with volume discounts, not a mandatory monthly subscription.

## Financial and generation safety rules

- Keep **estimated provider cost**, **reserved customer credits**, **provider-reported actual USD cost**, and **customer credit charge** as four separate concepts.
- An estimate is never an actual provider charge.
- A missing provider usage/cost field remains unknown; never infer it from prompt characters, video duration, model name, or a generic rate.
- Credit reservation/commit/release/refund must be performed by server-side transactional functions.
- Enforce a unique idempotency key per billable generation operation and unique provider webhook event IDs. A retry must not double-reserve or double-charge.
- Credit ledger rows are append-only. Corrections use compensating entries, not updates/deletes.
- Account-to-account transfers must be executed by a server-side database transaction that debits the sender and credits the recipient atomically. A failed transfer must not partially change either balance.
- A transfer must enforce available (unreserved) balance, verified sender identity, valid recipient, positive amount, and a unique idempotency key. Concurrent transfers must not overspend the same balance.
- Transfer records must identify sender, recipient, amount, status, timestamp and a unique reference. Each customer may read only transfer information involving their own account; customers cannot write ledger or transfer records directly.
- Credit transfers move VYRA usage credits only. They do not process or verify external payments between users.
- No generation starts without the existing explicit spend confirmation.
- Never persist raw OpenRouter/API keys in plaintext database records. Prefer user-supplied session keys initially; if persistent encrypted keys are later required, design a dedicated encryption/key-rotation boundary first.

### Transfer ledger reconciliation and risk policy

The credit ledger must use a balanced, double-entry representation for each completed account-to-account transfer: an equal sender debit and recipient credit, committed atomically and linked by one transfer reference. The signed credit movements for each transfer must sum to zero. A transfer must not be marked completed unless both entries are present. If cached balance columns are maintained for performance, update them in the same transaction and reconcile them against the immutable ledger.

Preserve credit provenance (purchased, promotional/bonus, and administrative adjustment) across transfers. Refunds and chargebacks require linked compensating entries; do not delete or mutate historical entries. Before payment launch, explicitly decide how refunds and chargebacks affect credits that have already been spent or transferred. Do not silently debit an unrelated recipient or create an undocumented negative balance.

Recipient lookup should use a public VYRA identifier and reveal only minimum confirmation details, not private email addresses. Enforce positive integer amounts, account eligibility, self-transfer prevention, configured limits, rate/velocity controls, privacy-preserving lookup and explicit final confirmation on the server. Define support and risk procedures for mistaken transfers, suspended accounts, compromised accounts and suspicious activity. A completed transfer is not automatically reversible; any correction must be an authorized compensating ledger event.

Transfers that allow or facilitate external resale need a separate legal and payment-provider review for Thailand and each intended market before release. Product documentation may define that VYRA does not operate an in-app marketplace or process external user-to-user payments, but must not claim that this automatically removes VYRA's legal or compliance responsibilities.
 
## Storage strategy

Store project and generation metadata in Postgres. Store large binary outputs in object storage and keep only object keys, checksums, content types, byte sizes, and ownership metadata in Postgres. Do not store base64 video/image payloads in relational rows.

Supabase Storage can be used for the first implementation, but video storage and egress limits must be measured before paid customer launch. Keep storage access behind an adapter so a later object-storage provider can be adopted without rewriting project records.

## Migration strategy

1. Add authentication and server identity verification behind a feature flag.
2. Create the first schema migration and RLS tests.
3. Add an explicit, user-triggered local-project import path. Preserve original local data until the server confirms a successful import.
4. Move project/job metadata to server storage incrementally; keep current local mode available as fallback during beta.
5. Add the credit ledger, atomic generation reservation/settlement and atomic account-to-account transfers before enforcing paid credit usage.
6. Add payment integration for credit purchases only after package pricing, volume discounts, refunds, webhook verification, and support processes are defined.

## Required environment variables

Server-side:
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY` (safe to expose only if explicitly used as a publishable client key; use server-side too for user-scoped clients)
- `SUPABASE_SECRET_KEY` (optional future administrative tasks only; never expose to the browser)

Browser build-time:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Do not configure any of these in production until the project is created and credentials are available. The app must fail closed for cloud features when configuration is missing and must not silently claim that cloud sync is active.

## Rollout and launch gate

Before accepting money from customers, require:
- Verified authentication on every customer API route.
- RLS enabled and tested for every exposed tenant table.
- Cross-user read/write denial tests.
- Idempotent credit ledger tests for success, failure, retry, cancellation, refund and webhook replay.
- Backups and a tested restore procedure.
- Storage lifecycle/retention policy and actual storage/egress cost review.
- Real credential end-to-end tests and a successful production deployment.

**Important:** The current VYRA app is not yet a multi-tenant SaaS and this document does not claim that authentication, cloud persistence, credits, subscriptions, or payments are implemented.
