# Temporary Guest Access for VYRAL Upload

## Purpose

This is a temporary development-only access path for the first VYRAL sample. The app creates a Supabase anonymous user automatically when the browser has no existing session. The user does not see a login or registration form.

This is not unauthenticated public Storage access. Supabase issues a normal short-lived access token for the anonymous identity, so the existing owner-scoped RLS policies and private `vyral-assets` bucket remain in place.

## Data placement

- Original image and other binary media: private Supabase Storage bucket `vyral-assets`.
- VYRAL name, asset metadata, byte size, SHA-256, versions, DNA, fingerprints, vision observations and lineage: Supabase Postgres tables.
- Storage object paths remain scoped under the anonymous user's UUID, matching the existing Storage ownership policies.

## Required hosted-project setting

Enable **Anonymous Sign-Ins** in the Supabase Dashboard under Authentication sign-in/provider settings for the VYRA Development project. The browser code cannot enable this hosted Auth setting.

For local Supabase development, the equivalent configuration is:

```toml
[auth]
enable_anonymous_sign_ins = true
```

## Important limitations

- A guest identity is tied to the current browser's persisted Supabase session.
- If browser storage is cleared, the user signs out, or the user switches device/browser, the same anonymous identity cannot be recovered automatically.
- Do not sign out until the sample VYRAL has been exported/backed up or deliberately discarded.
- Anonymous sign-in is still an Auth session internally. It removes the visible login requirement; it does not create a public unauthenticated Storage policy.
- Anyone who can reach a publicly deployed app with anonymous sign-ins enabled may be able to create their own guest identity. This temporary mode is not a production access-control strategy. Before public launch, add abuse controls and explicit guest/permanent-user policy boundaries.

## Scope

Guest sessions may open the profile and My Vyrals workflow. Workspace and AI Chat continue to require a permanent account. Existing permanent account sign-in remains available.
