# Supabase Development Environment Runbook

**Current state (2026-11-03):** the dedicated `VYRA Development` Supabase project exists and is healthy. All eight repository migrations are applied there. The five pgTAP database suites have passed against the development database. Production remains unchanged and is not approved for migration.

## Environment boundary

- Development project: `VYRA Development`, region `eu-west-3`, PostgreSQL 17, status `ACTIVE_HEALTHY`.
- Production project: `VYRA`, region `eu-west-3`, PostgreSQL 17, status `ACTIVE_HEALTHY`.
- The two projects are separate. Never use production credentials or project references during development.
- Do not paste credentials, connection strings, access tokens, or service-role keys into GitHub issues, pull requests, chat, source files, or screenshots.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Never use a `VITE_` prefix for it.
- Do not apply migrations to production until the release gates below are complete and production approval is explicit.

## 1. Applied development migrations

The following filenames are aligned with the exact migration versions recorded in the development database. Do not rename or rewrite already-applied migrations.

1. `20261103101212_initial_customer_data.sql`
2. `20261103101221_usage_credit_ledger.sql`
3. `20261103101229_atomic_credit_transfers.sql`
4. `20261103101236_public_usernames.sql`
5. `20261103101243_credit_wallet_snapshot.sql`
6. `20261103101251_credit_transfer_velocity_limits.sql`
7. `20261103101446_restrict_trigger_helper_execution.sql`
8. `20261103101701_index_composite_owner_foreign_keys.sql`

The migrations create customer profiles/projects, the append-only usage and credit ledger, provider cost records, atomic transfers, public username lookup, a read-only wallet snapshot, transfer velocity enforcement, restricted trigger-helper execution, and composite foreign-key indexes.

## 2. Development verification already completed

- Development project is `ACTIVE_HEALTHY`.
- All eight migrations are recorded in its migration history.
- The five database pgTAP suites passed against the development project:
  - `rls.test.sql`
  - `usage-ledger.test.sql`
  - `public_usernames.test.sql`
  - `credit_wallet.test.sql`
  - `credit_transfers.test.sql`
- GitHub CI checks for PR #94 passed: database, verify, and browser UI.
- Security Advisor no longer reports public execution of internal trigger helpers.
- Performance Advisor no longer reports unindexed composite ownership foreign keys.

Remaining development Advisor findings are understood:
- The `credit_transfer_policy` and `profile_lookup_limits` tables intentionally have RLS enabled with no application policies; application roles have no table access.
- `get_credit_wallet()` and `search_credit_recipients()` are intentionally callable by authenticated users and validate the caller inside the function.
- Leaked Password Protection is unavailable on the current Free plan (Supabase documents it as Pro and above).
- Unused-index notices are informational on the still-small development dataset.

## 3. Development configuration still to verify

Before authenticated API end-to-end tests:

1. In the development Supabase Dashboard, confirm Email authentication is enabled.
2. Set the development Site URL and allowed redirect URLs to the actual VYRA development URL.
3. Confirm the development project URL, publishable/anon key, and service-role key are configured in the correct Vercel environment scopes.
4. Confirm `SUPABASE_SERVICE_ROLE_KEY` exists only as a server-side encrypted/sensitive variable; never add a `VITE_` variant.
5. Create two dedicated development test accounts. Do not use real customer accounts or production accounts.
6. Run authenticated tests for wallet reads, username changes, recipient lookup, transfer history, and transfers between the two test accounts.

Do not copy production callback URLs or production credentials into development.

## 4. Local validation workflow

Install the Supabase CLI and Docker, then run from the repository root:

```sh
supabase start
supabase db reset
supabase test db
```

These commands target the local Supabase stack. Confirm the local stack is running before resetting it. Use the current migration filenames in `supabase/migrations`.

For a new migration, create the file with `supabase migration new <descriptive_name>`, review the SQL, apply and test it locally, then apply it to the development project. Never rewrite an already-applied migration; add a corrective migration instead.

## 5. Development end-to-end test gate

The database suites passing does not replace authenticated HTTP end-to-end tests. Still required:

- Missing/invalid Supabase access token is rejected.
- User A cannot read or update User B's profile, projects, wallet, or transfers.
- A user cannot spoof the sender ID in a transfer request.
- Same idempotency key returns the original transfer and does not create another ledger pair.
- Insufficient balance and invalid recipient are rejected.
- Concurrent transfers cannot overspend the same sender.
- The hourly and daily transfer limits return HTTP 429 across separate serverless requests.
- Recipient lookup returns only public username/display name/user ID and is rate-limited.
- Service-role credentials never appear in browser bundles, client storage, API responses, or logs.
- No production user, balance, ledger row, or secret is present in development.

## 6. First usage-recorder integration increment

The server has an opt-in recorder for OpenRouter Text chat only. When `VYRA_USAGE_LEDGER_ENABLED=true`, it requires a verified Supabase session and an idempotency key, creates a generation job/provider attempt before calling OpenRouter, and stores safe usage metadata plus provider-reported cost when available. It does not store prompts or BYOK keys and does not charge credits.

This is not yet a complete generation-to-ledger implementation:
- Gemini text and OpenRouter Image, Audio, and Video are not yet recorded.
- No credit reservation, settlement, or charging is enabled.
- Keep the flag `false` until two-account authenticated Development E2E tests pass.
- Do not set this flag in Preview or Production yet.

Record test results and the migration version. Use only the dedicated development test accounts.

## 7. Production state and release gates

The production project is still separate and has not received the eight development migrations. Its current public schema contains only the existing `profiles` and `projects` tables. Its migration history is not yet aligned with the repository, so do not run `db push` against production.

Production remains **not approved** until all of the following are complete:

- Authenticated wallet, username, recipient, and transfer API end-to-end tests pass in development.
- Vercel production and preview environment variables are independently verified without exposing secret values.
- Backup and restore/rollback options are confirmed for the actual production plan; a recoverable backup/export is created and verified.
- The restore procedure is documented and tested in a separate non-production project where possible.
- A production migration plan, monitoring plan, and explicit production approval exist.
- The production migration history is reconciled safely; do not assume the production schema matches the migration chain merely because table names look similar.

A successful GitHub CI run or successful development migration does not authorize a production migration. Until this gate is complete, do not represent wallet transfers or credit charging as live production financial functionality.
