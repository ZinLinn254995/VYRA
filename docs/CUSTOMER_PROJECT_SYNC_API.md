# Customer Project API (Phase 1)

This increment adds authenticated server endpoints for reading and importing customer-owned project metadata. It does not change the browser's local-first project workflow and does not automatically upload local projects.

## Endpoints

All endpoints require a Supabase access token:

`Authorization: Bearer <access_token>`

### GET /api/projects

Returns the authenticated customer's project rows. The Supabase request uses the customer's bearer token and public anon key; Postgres RLS remains the ownership boundary.

### POST /api/projects/import

Accepts an explicit batch import:

```json
{
  "projects": [
    {
      "localId": "existing-browser-project-id",
      "title": "My video project",
      "status": "draft",
      "projectData": {
        "topic": "A short science explainer"
      }
    }
  ]
}
```

- 1–100 projects per request.
- `user_id` is always assigned from the server-verified Supabase identity; client-supplied owner IDs are ignored.
- Rows upsert by `(user_id, local_id)`, making retries safe for the same local project.
- The server strips credential-like fields, device-local generated media IDs, blob/data URLs and local media URL fields from portable project JSON.
- Invalid or oversized project payloads are rejected before any database write.
- Database errors do not alter or delete the browser's local project data.

## Required server environment

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

The same public anon/publishable key may be used for server requests with the user's bearer token. Do not use a service-role/secret key for customer project CRUD.

## Current scope and next step

This is an API foundation only. The app does not yet show a cloud sync/import screen, automatically sync edits, upload generated media, or delete cloud projects. The next UI increment should provide a clear preview and explicit user confirmation before importing local projects. Keep local data untouched until the server confirms the imported records.
