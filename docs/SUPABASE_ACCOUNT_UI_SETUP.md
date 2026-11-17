# Supabase account UI setup

This phase adds optional email/password sign-in to the VYRA header. The local Studio remains usable when Supabase is not configured.

## Required environment variables

Set the following in the Vercel project (and local .env for development):

| Variable | Where | Purpose |
| --- | --- | --- |
| VITE_SUPABASE_URL | Browser build | Supabase project URL |
| VITE_SUPABASE_ANON_KEY | Browser build | Supabase anon/publishable key; this key is public by design |
| SUPABASE_URL | Server runtime | Supabase project URL for server-side token verification |
| SUPABASE_ANON_KEY | Server runtime | Same anon/publishable key for the Auth user endpoint |

Never use a Supabase service-role key in the browser or as a VITE_ variable.

## Supabase dashboard

1. Create a Supabase project.
2. Copy its Project URL and anon/publishable key into the four variables above.
3. In Authentication > Providers, enable Email.
4. Configure the Site URL and allowed redirect URLs for the deployed VYRA domain.
5. Decide whether email confirmation is required. If enabled, users must confirm before they can sign in.

## What users can do now

- Open the account control in the top header.
- Create an account with email/password.
- Sign in and retain their Supabase session on the device.
- Sign out.
- See whether the VYRA server verified their current access token.

## Important limitations

Authentication is optional and does not yet turn on cloud project storage. Projects remain in the existing local browser workspace. No project data is uploaded by this UI. Credits, billing, paid plans, and customer cloud sync are not implemented. A successful Supabase sign-in alone is not a production SaaS launch.

The browser uses Supabase's supported client library for session persistence and refresh. The server separately verifies access tokens through Supabase Auth. Do not trust client-supplied user IDs for future database operations; every cloud API must verify the bearer token and enforce row-level security.
