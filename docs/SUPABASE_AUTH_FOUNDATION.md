# Supabase Auth verification foundation

**Document scope:** server-side authentication verification endpoint only. For the later account UI and setup instructions, see [Supabase Account UI Setup](./SUPABASE_ACCOUNT_UI_SETUP.md). This document does not describe the entire customer account experience.

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

## Scope and relationship to account UI

This document records the server-side token-verification foundation. The separate [Supabase Account UI Setup](./SUPABASE_ACCOUNT_UI_SETUP.md) document describes the optional email/password sign-in UI and browser session behavior added around that foundation.

Sign-in alone does not enable cloud project storage, automatic synchronization, credits, billing, or a production SaaS launch. Existing local-first usage remains available. Protected cloud APIs must verify the token and enforce database ownership policies before customer cloud data is enabled.

## Tests

Run `npm run test:auth`. CI runs this test suite alongside TypeScript checks and the production build. Tests cover missing configuration, malformed tokens, successful identity verification, expired tokens, and upstream failures.
