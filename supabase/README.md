# Supabase database development

## First migration

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

The pgTAP suite in `supabase/tests/database/rls.test.sql` creates two fixture customers and verifies that one customer cannot read, insert as, update, or delete the other customer's project or read the other profile.

Before linking a real project, create a separate development Supabase project. Never point local development migrations at production by accident.

## Not implemented by this migration

Authentication UI/session management, server-side bearer-token verification, project import/sync, assets, generation jobs, credits, actual provider-cost ledger, subscriptions and payments. Those are separate increments. The current browser-only app remains unchanged.
