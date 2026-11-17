# Creative Project Platform Architecture

## Product direction

VYRA is a project-based creative workspace. Each project has three simple working areas:

1. **AI Chat** — the primary way to discuss ideas, request creative work, and ask the AI to operate on the project.
2. **Editor** — a video-editing workspace that the user and AI can both operate.
3. **Storage** — a project-scoped file manager for uploaded, generated, and working files, including ordinary notes and project context.

There is no separate Details area. Project information, notes, references, plans, and other context are ordinary files in Storage. The AI can create, read, update, organize, and use those files through authorized project-scoped tools.

The product should stay simple for the user. The application provides reliable tools and boundaries; the AI decides how to reason about the creative work.

## Foundation systems

These are infrastructure capabilities, not additional user-facing product areas:

- **Project isolation and permissions:** enforce ownership and project boundaries for every read, write, edit, and AI tool call.
- **Storage and file management:** safely upload, list, search, read, create, update, move, and delete project files.
- **Version history:** preserve revisions and allow recovery of previous file/project states.
- **AI tool access:** expose explicit, scoped tools for AI Chat, Editor, and Storage, with least-privilege permissions.
- **Data safety and recovery:** validate destructive operations, maintain recoverable state, and require confirmation for critical irreversible actions.
- **Task and job management:** track long-running generation and editing jobs, including progress, failures, retries, and resumption.

## AI responsibility

The AI may derive and maintain whatever project knowledge, references, notes, plans, or other internal records it needs. Those records belong to the relevant project's Storage and remain isolated to that project. The application does not prescribe a mandatory DNA, character-profile, relationship-map, universe, or consistency subsystem.

The AI should use relevant project files, conversation history, and editor state when carrying out work. It should distinguish confirmed project facts from tentative ideas, preserve provenance where practical, and handle conflicting information carefully.

## Application responsibility

The application is responsible for secure execution, persistence, project isolation, tool permissions, versioning, recovery, and job orchestration. It must not rely on the AI model alone to enforce security or prevent cross-project access.

## Scope guardrails

- Keep the approved user interface and styling unchanged during backend and code cleanup.
- Keep the three user-facing areas: AI Chat, Editor, and Storage.
- Project details belong in Storage as ordinary files; do not recreate a separate Details tab, panel, or tool surface.
- Do not add mandatory user-facing DNA, character, relationship, universe, or consistency-management areas.
- Do not remove working capabilities required by the three areas or foundation systems.
- Treat existing database migrations as deployed history; do not delete or rewrite them as part of ordinary source cleanup.
- Prefer removing obsolete application code only after its imports, API routes, tests, and database dependencies have been traced.
