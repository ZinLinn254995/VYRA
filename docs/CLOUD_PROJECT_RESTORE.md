# Cloud Project Restore

The Project Catalog includes a user-initiated restore flow for project metadata previously backed up to the same Supabase account.

## Restore behavior

1. Sign in and wait for VYRA's server-side session verification.
2. Choose **Find cloud backups** to read the account's cloud project list.
3. Review the project titles and scene counts.
4. Choose **Restore new projects** to add only projects whose local IDs are not already present on this device.

Existing local projects are never overwritten by this restore action. Invalid rows are skipped during conversion. Restored projects receive safe local placeholder imagery because generated media files and device-only media references are not stored in the metadata backup.

## Limitations

- Restore is manual; it does not run in the background.
- Only projects saved through the Cloud Project Backup flow are available.
- Generated image, audio and video files are not restored.
- If a project with the same local ID already exists on the device, it is skipped rather than merged or overwritten.
- Automatic two-way sync, conflict resolution and media object storage remain future work.
