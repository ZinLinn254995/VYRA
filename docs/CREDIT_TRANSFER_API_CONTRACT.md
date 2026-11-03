# Credit Transfer API Contract

## Status

The API routes are an integration layer over the database transfer RPC. The full migration chain is applied and database-tested in the separate `VYRA Development` Supabase project only. Production has not received these migrations and remains gated on authenticated end-to-end testing, verified server-only deployment secrets, backup/restore preparation, and explicit production approval. Passing database tests does not mean customer transfers are live.

## Endpoint

### POST /api/credits/transfers

Requires a valid Supabase access token in the Authorization bearer header.

Request body:

- `recipientUserId`: recipient VYRA account UUID.
- `amount`: positive whole-number credit amount within JavaScript's safe integer range.
- `idempotencyKey`: client-generated stable request key; reuse the same key for retries of the same intended transfer.
- `note`: optional text, up to 500 characters.

The sender ID is always derived from the verified Supabase session. A sender ID supplied in the request body is ignored.

The server calls the service-role-only `transfer_credits` database RPC. The service-role key must remain in server-only `SUPABASE_SERVICE_ROLE_KEY`; never expose it through a `VITE_` variable or return it to the browser.

Known errors:
- `400`: invalid recipient identifier, amount, idempotency key or note.
- `401`: missing or invalid customer session.
- `409`: insufficient available credits or an idempotency-key conflict.
- `429`: the sender has reached the database-enforced transfer velocity limit (10 new transfers per rolling hour or 30 per rolling 24 hours by default).
- `503`: transfer infrastructure is not configured or temporarily unavailable.

A network timeout can leave the client uncertain whether the transfer completed. The client must query transaction history using the same authenticated account before deciding whether to retry, and must reuse the original idempotency key.

### GET /api/credits/transfers

Requires a valid Supabase access token. Reads up to 100 recent transfers through the customer's normal session and database RLS. Only the sender and recipient can see a transfer. The API returns a deliberately limited set of fields and never returns internal metadata or arbitrary notes.

## Release gates

- Configure and validate `SUPABASE_SERVICE_ROLE_KEY` only in server-side deployment secrets.
- The dedicated `VYRA Development` project already has the complete migration chain applied; keep future schema changes development-first and version-controlled.
- Public username management and recipient lookup are implemented in the API and database migration. Recipient lookup uses a minimum 3-character prefix, returns at most 8 matches, exposes only user ID/username/display name, and is limited to 20 requests per authenticated user per minute by a database-backed counter. No email lookup is provided.
- The authenticated wallet includes a review-and-confirm transfer flow, and durable database-backed transfer velocity controls are active in the development database (10 new transfers/hour and 30/24 hours per sender by default). They are not active in production because the production migration has not been approved or applied. Decide separately whether per-transfer or daily credit-amount caps are needed before public launch; no amount cap is currently implemented.
- Complete authenticated end-to-end tests against a non-production Supabase project.
- Do not enable paid credit purchases, generation charging, or external resale through this API.

## Public username and recipient discovery

### POST /api/credits/username

Requires a valid Supabase access token. The server derives the profile owner from the verified session and updates only that user's profile row.

Request body:
- `username`: 3–24 characters using lowercase letters, numbers or underscores. Input is normalized to lowercase. Send `null` to clear the handle.

A duplicate username returns `409`. The database enforces the format and uniqueness constraints independently of API validation.

### GET /api/credits/recipients?query=prefix

Requires a valid Supabase access token. Search uses a prefix of at least 3 valid characters and returns at most 8 matches. Results contain only `userId`, `username`, and optional `displayName`; email addresses and private profile fields are never returned. The database enforces a durable limit of 20 lookups per authenticated user per minute, including across serverless instances. Exceeding the limit returns `429`.

## Credit wallet

### GET /api/credits/wallet

Requires a valid Supabase access token. The API calls the authenticated `get_credit_wallet()` RPC using the customer's bearer session. The account ID is derived from `auth.uid()`; clients cannot request another account's wallet.

The response contains:
- `account.username` and `account.displayName` (public profile values only).
- `availableBalance` and `reservedBalance` as integer strings to preserve exact bigint values.
- `recentActivity`: at most 50 safe ledger fields, with no raw metadata or private account data.

The balances are calculated across the complete append-only ledger. The activity list is a recent display window, not the source of the total. The RPC is read-only and does not create, grant, reserve, transfer, or charge credits.

## Wallet UI status

The Credit Wallet screen provides authenticated balance viewing, username management, recipient lookup, a review-and-confirm transfer flow, and recent ledger activity. It does not provide credit purchases, cash withdrawals, generation charging, or provider billing. Production use remains gated on applying migrations to a dedicated development Supabase project, validating the server-only service-role secret, and passing authenticated end-to-end tests. The transfer velocity policy is active in the development database only; it is not active in production until the production migration is approved and applied.

## Transfer velocity enforcement

Every newly inserted transfer is checked inside PostgreSQL, not in serverless memory or only in the browser. The sender account lock serializes concurrent transfers before the database counts recent completed transfers. An idempotent retry returns the original transfer before a new insert and therefore does not consume another transfer slot.

The initial configurable policy is **10 new transfers per rolling hour and 30 per rolling 24 hours per sender**. Exceeding either limit returns database code `P4291`, mapped by the API to HTTP `429`. The policy is stored in the private singleton table `credit_transfer_policy`; clients and the service role cannot read or change it. Adjustments require a reviewed database migration by an authorized database operator. These are operational anti-abuse defaults, not finalized commercial terms or transfer amount limits.

No per-transfer or daily credit-amount cap has been selected. The existing positive-integer, available-balance and atomic-ledger checks continue to apply. Revisit the provisional velocity defaults using actual abuse/support data before a public launch.


## Current environment status

As of 2026-11-03, all eight Supabase migrations are applied to the separate `VYRA Development` project and the five database pgTAP suites pass. Authenticated HTTP end-to-end testing with two dedicated development accounts is still outstanding. The production project remains on its pre-existing `profiles` / `projects` schema; do not apply the new migrations or enable customer-facing transfers there yet.

The Supabase organization is currently on the Free plan. Supabase documents Leaked Password Protection as a Pro-plan-and-above feature, so that particular Auth hardening setting cannot be enabled on the current plan.
