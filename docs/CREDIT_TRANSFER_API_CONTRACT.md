# Credit Transfer API Contract

## Status

The API routes are an integration layer over the database transfer RPC. The production Supabase migration must still be applied separately after an approved backup/rollback plan. The route must not be enabled for customers until the required server-only secret and production schema are configured.

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
- `503`: transfer infrastructure is not configured or temporarily unavailable.

A network timeout can leave the client uncertain whether the transfer completed. The client must query transaction history using the same authenticated account before deciding whether to retry, and must reuse the original idempotency key.

### GET /api/credits/transfers

Requires a valid Supabase access token. Reads up to 100 recent transfers through the customer's normal session and database RLS. Only the sender and recipient can see a transfer. The API returns a deliberately limited set of fields and never returns internal metadata or arbitrary notes.

## Release gates

- Configure and validate `SUPABASE_SERVICE_ROLE_KEY` only in server-side deployment secrets.
- Apply the database migration to a dedicated development Supabase project and verify rollback/backup procedures.
- Public username management and recipient lookup are implemented in the API and database migration. Recipient lookup uses a minimum 3-character prefix, returns at most 8 matches, exposes only user ID/username/display name, and is limited to 20 requests per authenticated user per minute by a database-backed counter. No email lookup is provided.
- Customer-facing confirmation UI and transfer velocity controls (including limits on transfer amount/volume, not only search requests) remain required before public launch.
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
