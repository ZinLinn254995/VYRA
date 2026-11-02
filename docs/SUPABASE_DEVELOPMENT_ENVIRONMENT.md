# Supabase Development Environment Runbook

**Status:** preparation only. No Supabase project has been linked and no remote migration has been applied by this runbook.

## Non-negotiable environment boundary

- Create a dedicated Supabase project named for VYRA development. It must be separate from any production project.
- Do not use a production Project URL, project ref, database password, access token, or service-role key during development.
- Do not paste credentials, connection strings, access tokens, or service-role keys into GitHub issues, pull requests, chat, source files, or screenshots.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Never use a `VITE_` prefix for it.
- Stop before any remote command if the selected project ref and Dashboard project name do not clearly identify the development project.

## 1. Create the development project

In the Supabase Dashboard:

1. Create a new project dedicated to VYRA development.
2. Use a strong, unique database password and store it in a password manager.
3. Select a region appropriate for the development team and expected test users.
4. Wait until the project reports that the database is ready.
5. Record the project name and project ref privately. Do not commit either value if it is considered environment-specific configuration.
6. In Authentication > Providers, enable Email for the development project.
7. Configure the development Site URL and allowed redirect URLs for the development VYRA URL. Do not copy production callback URLs unless they are intentionally shared.

No production project should be linked in this workflow.

## 2. Configure local environment variables

Copy `.env.example` to `.env.local` (or the environment file convention used by the local runtime) and fill only development-project values:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Development Project URL; browser-visible |
| `VITE_SUPABASE_ANON_KEY` | Development anon/publishable key; browser-visible by design |
| `SUPABASE_URL` | Same development Project URL; server runtime |
| `SUPABASE_ANON_KEY` | Same development anon/publishable key; server runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Development service-role key; server runtime only |

Never commit local env files. Verify `.gitignore` excludes them before adding credentials. Do not add the service-role key to browser code, build-time `VITE_` variables, client storage, or logs.

## 3. Validate migrations locally first

Install the Supabase CLI and Docker, then run the repository's documented local workflow from the project root:

```sh
supabase start
supabase db reset
supabase test db
```

These commands target the local Supabase stack. Confirm the local stack is running before resetting it. The database test suite must pass before proceeding to the remote development project.

Expected migration order:

1. `20261101000100_initial_customer_data.sql`
2. `20261102000100_usage_credit_ledger.sql`
3. `20261103000100_atomic_credit_transfers.sql`
4. `20261103000200_public_usernames.sql`
5. `20261103000400_credit_wallet_snapshot.sql`
6. `20261103000500_credit_transfer_velocity_limits.sql`

Do not invent a missing migration for the numeric gap in the filenames. Use the migration files actually committed to the target branch.

## 4. Link and inspect the development project

Only after independently confirming the Dashboard project name and ref:

```sh
supabase projects list
supabase link --project-ref "$DEV_PROJECT_REF"
supabase migration list
```

Set `DEV_PROJECT_REF` locally from the development project details. Do not put the value or database password in source control.

Before applying anything remotely:

- Re-check the linked project ref against the development project in the Dashboard.
- Inspect the migration list and resolve any unexpected remote/local history mismatch.
- Review the pending migration files and the CLI plan/output.
- If the linked target is ambiguous, stop. Do not try a different project ref as a guess.

Apply migrations to the development project only after the above checks are complete:

```sh
supabase db push
```

Read the CLI output before confirming any prompt. If it identifies a project other than the dedicated development project, cancel immediately.

## 5. Development verification gate

After migrations are applied to the development project:

- Confirm all expected tables, functions, triggers, indexes, and RLS policies exist.
- Confirm ordinary authenticated users can access only their own private rows.
- Confirm anonymous users cannot access private wallet or transfer data.
- Confirm financial write functions are unavailable to `anon` and `authenticated`.
- Confirm the service-role key is used only by server-side code and is not returned in API responses.
- Run the database pgTAP suite against a clean local stack; retain the CI result as evidence.
- Configure two dedicated development test accounts and run authenticated wallet and transfer E2E tests.
- Verify successful transfers produce equal sender debit and recipient credit entries.
- Verify idempotent retries do not create duplicate transfers.
- Verify insufficient balance and concurrent transfer cases are rejected safely.
- Verify the hourly and daily transfer limits return HTTP 429 and remain enforced across separate serverless requests.
- Verify recipient lookup privacy and its database-backed rate limit.
- Verify no production user, balance, ledger row, or secret is present in the development project.

Record the test run, migration version, project ref (in a private operations record), and any failures. Do not use real customer accounts or production credit balances for these tests.

## 6. Backup and rollback discipline

Before any production migration is even considered:

- Confirm what backup and point-in-time recovery options are available for the production project's plan and current settings.
- Create and verify a recoverable backup/export using the supported Supabase procedure for that project.
- Write down the restore procedure and identify who can perform it.
- Test the restore procedure in a separate non-production project where possible.
- Review whether each schema change has a safe forward-fix path. Do not assume every migration can be reversed by simply dropping objects.
- Preserve applied migration files. For an already-applied migration, prefer a new corrective migration over rewriting its history.
- For a disposable development database only, rebuilding from migrations is acceptable after confirming the target is the development project.

## 7. Production release gate

Production remains **not approved** until all of the following are explicitly reviewed:

- Development migrations applied cleanly and the complete database verification suite passes.
- Authenticated wallet and transfer E2E tests pass with dedicated development users.
- RLS, grants, RPC permissions, idempotency, concurrency, and velocity limits are verified.
- Backup and restore/rollback procedures are documented and tested.
- Production environment variables are checked independently, with service-role credentials stored only as server secrets.
- A separate production migration plan, maintenance/monitoring plan, and explicit production approval exist.

A successful GitHub CI run or a successful development migration does not by itself authorize a production migration. Until this gate is completed, credit wallet and transfer functionality must not be represented as live financial functionality.
