# Supabase Auth verification foundation

VYRA now exposes an optional server-side session verification endpoint. It is intentionally separate from the existing local-first Studio experience.

## Environment

Configure these server-side variables in the development/production environment:

- `SUPABASE_URL`: URL of the Supabase project.
- `SUPABASE_ANON_KEY`: the project's anon/publishable key. This endpoint uses it only to call Supabase Auth's user endpoint; never use a service-role key here.

Do not put credentials in `VITE_` variables. The endpoint returns only the authenticated user's ID, email (when present), and user metadata.

## Endpoint

`GET /api/auth/session`

Send `Authorization: Bearer <supabase-access-token>`.

- `200`: token verified by Supabase Auth; response includes `authenticated: true` and a safe user identity.
- `401`: missing, invalid, or expired token.
- `503`: Supabase is not configured or the Auth service is unavailable.

The server does not trust a user ID supplied in the request. It asks Supabase Auth to validate the bearer token and derives the identity from the verified response. Responses are not cacheable.

## Deliberate scope

This endpoint does not yet add sign-in UI, browser session management, project synchronization, tenant-scoped API enforcement, credits, or billing. Existing local-only usage remains unchanged. Do not treat this endpoint alone as a production SaaS authentication rollout; protected project APIs must verify the token and rely on database RLS before cloud data is enabled.

## Tests

Run `npm run test:auth`. CI runs this test suite alongside TypeScript checks and the production build. Tests cover missing configuration, malformed tokens, successful identity verification, expired tokens, and upstream failures.
