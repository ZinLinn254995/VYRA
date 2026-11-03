# Supabase database development

## Migrations

The initial migration creates `profiles` and `projects`. The usage-ledger migration adds server-owned `generation_jobs`, `provider_attempts`, `provider_cost_records`, and append-only `credit_ledger_entries`. The account-transfer migration adds immutable `credit_transfers` and a service-role-only atomic transfer RPC. The wallet snapshot migration adds an authenticated read-only RPC that calculates balances from the append-only ledger and returns a limited recent activity list.

- Customer sessions receive read-only access to their own usage and ledger rows. Transfer history is visible only to the sender and recipient.
- Only the server `service_role` may execute financial write functions. Never expose `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` to the browser.
- Estimates, reserved credits, and provider-reported actual USD costs remain separate values.
- Repeated financial operations use per-customer idempotency keys; corrections append compensating entries instead of editing ledger history.
- Each committed transfer must have exactly one sender debit and one equal recipient credit. A deferred database constraint verifies that the pair is balanced before commit.
- Transfer RPC calls acquire account locks in stable order and use the same per-account lock namespace as generation ledger writes to prevent concurrent overspending.
- Recipient discovery uses public usernames only. The lookup RPC requires authentication, accepts prefixes of at least 3 characters, returns at most 8 results, and enforces 20 lookups per user per minute using a database-backed counter. It returns only account ID, username and display name; it never returns email addresses.
- Users can set or clear their own username through the authenticated API. Handles are 3–24 lowercase letters, numbers or underscores and must be unique.
- This migration is schema groundwork only. Do not apply it to production until the server API, authenticated end-to-end tests, backup/rollback plan, and explicit production approval are complete.

## Initial customer-data migration

The initial schema is intentionally small:
- `profiles`: one private profile per Supabase Auth user.
- `projects`: customer-owned project metadata, with the original browser project ID preserved as `local_id`.

Every exposed table has Row Level Security (RLS). Policies derive ownership from `auth.uid()`; the API must still verify the caller's bearer token. The browser must never submit a trusted owner ID.

Large generated images/audio/video remain outside Postgres. Do not put base64 data, Blob contents, API keys, or device-local IndexedDB references into `project_data`.

## Local validation

Install the Supabase CLI, then run:

```sh
supabase start
supabase db reset
supabase test db
```

The pgTAP suite in `supabase/tests/database` verifies customer isolation, balanced transfer accounting, idempotency, insufficient-balance rejection, server-only financial writes, and immutable financial records.

Before linking a real project, create a separate development Supabase project. Never point local development migrations at production by accident.

## Not implemented by the current migrations

Authentication UI/session management, project import/sync, assets, generation-to-ledger server integration, credit purchase packages, and payment provider integration remain separate increments. The wallet and transfer UI/API are an early customer-facing layer, not a production billing launch. No production migration or customer-facing credit charging is enabled by this change.

## Public username and recipient lookup

The `20261103000200_public_usernames.sql` migration adds `profiles.username`, a unique lowercase handle. Authenticated users can update only their own profile row. `POST /api/credits/username` accepts `{ "username": "handle" }` (or `null` to clear it); `GET /api/credits/recipients?query=han` returns at most eight prefix matches. Search requires at least three valid characters and is limited to 20 requests per user per minute by a database-backed counter, so limits remain effective across serverless instances. Public results contain only `userId`, `username`, and optional `displayName`. Never expose email addresses or private profile columns in recipient lookup.

## Credit wallet snapshot

The `20261103000400_credit_wallet_snapshot.sql` migration adds `get_credit_wallet()`. It requires an authenticated Supabase session, derives the account from `auth.uid()`, and returns available/reserved totals as exact integer strings plus at most 50 safe activity fields. Balances are derived from the complete append-only ledger; the recent activity list is only a display window. The function does not allow financial writes and does not expose ledger metadata.

## Transfer velocity policy

Migration `20261103000500_credit_transfer_velocity_limits.sql` enforces sender-level rolling limits in PostgreSQL: 10 new transfers/hour and 30 new transfers/24 hours by default. The trigger uses the same per-account advisory lock as the atomic transfer RPC, so parallel requests cannot race around the counters. Same-key idempotent retries do not create a new row or consume another slot. The private `credit_transfer_policy` singleton is not readable or writable by application roles; policy changes must be reviewed and applied as database migrations. The API maps the limit error to HTTP 429.
