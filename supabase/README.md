# Supabase database development

## Migrations

The initial migration creates `profiles` and `projects`. The usage-ledger migration adds server-owned `generation_jobs`, `provider_attempts`, `provider_cost_records`, and append-only `credit_ledger_entries`. The account-transfer migration adds immutable `credit_transfers` and a service-role-only atomic transfer RPC.

- Customer sessions receive read-only access to their own usage and ledger rows. Transfer history is visible only to the sender and recipient.
- Only the server `service_role` may execute financial write functions. Never expose `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` to the browser.
- Estimates, reserved credits, and provider-reported actual USD costs remain separate values.
- Repeated financial operations use per-customer idempotency keys; corrections append compensating entries instead of editing ledger history.
- Each committed transfer must have exactly one sender debit and one equal recipient credit. A deferred database constraint verifies that the pair is balanced before commit.
- Transfer RPC calls acquire account locks in stable order and use the same per-account lock namespace as generation ledger writes to prevent concurrent overspending.
- The transfer RPC accepts account UUIDs for now. A public username/recipient-discovery flow and customer-facing API/UI are separate increments.
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

Authentication UI/session management, server-side bearer-token verification for transfer routes, project import/sync, assets, generation-to-ledger server integration, credit purchase packages, payment provider integration, public usernames/recipient discovery, and customer-facing transfer UI. Those are separate increments. No production migration or customer-facing credit charging is enabled by this change.
