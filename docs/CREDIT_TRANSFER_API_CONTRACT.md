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
- Add public recipient lookup by VYRA username before expecting customers to discover UUIDs; do not expose email-based lookup.
- Add durable rate/velocity controls and customer-facing confirmation UI before public launch.
- Complete authenticated end-to-end tests against a non-production Supabase project.
- Do not enable paid credit purchases, generation charging, or external resale through this API.
