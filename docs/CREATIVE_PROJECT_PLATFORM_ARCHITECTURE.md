# Creative Project Platform Architecture

## Product direction

VYRA is a project-based creative workspace with three simple working areas:

1. **AI Chat** — the primary way to discuss ideas, request creative work, and ask the AI to operate on the project.
2. **Editor** — a video-editing workspace that the user and AI can both operate.
3. **Storage** — a project-scoped, general-purpose file manager.

These are working areas, not restrictions on what a project may contain. Storage must not impose required file types, folder structures, metadata, notes, project-detail documents, AI knowledge files, or other content conventions. Users may store any supported files, or store nothing when they have nothing to keep there.

Project details and context are optional. A user may keep them in Storage if useful, communicate them in AI Chat, or handle them another way supported by the product. The application must not force project details into files or make Storage a mandatory knowledge system.

The product should stay simple for the user. The application provides reliable tools and boundaries; the AI decides how to reason about the creative work.

## Foundation systems

These are infrastructure capabilities, not additional user-facing product areas:

- **Project isolation and permissions:** enforce ownership and project boundaries for every read, write, edit, and AI tool call.
- **Storage and file management:** safely upload, list, search, read, create, update, move, and delete user-selected project files without imposing content conventions.
- **Version history:** preserve revisions where appropriate and allow recovery of previous file/project states.
- **AI tool access:** expose explicit, scoped tools for AI Chat, Editor, and Storage, with least-privilege permissions.
- **Data safety and recovery:** validate destructive operations, maintain recoverable state, and require confirmation for critical irreversible actions.
- **Task and job management:** track long-running generation and editing jobs, including progress, failures, retries, and resumption.

## AI responsibility

The AI may use information available through the conversation, project state, editor state, and files the user has chosen to store. Depending on the task, it may create or maintain supporting files when useful and authorized, but this is optional and must never be a platform requirement.

The application does not prescribe a mandatory DNA, character-profile, relationship-map, universe, consistency subsystem, project-details document, or AI-knowledge file structure. The AI should adapt to the actual task and available context rather than forcing every project into a fixed information model.

The AI should distinguish confirmed project facts from tentative ideas, preserve provenance where practical, and handle conflicting information carefully.

## Application responsibility

The application is responsible for secure execution, persistence, project isolation, tool permissions, versioning, recovery, and job orchestration. It must not rely on the AI model alone to enforce security or prevent cross-project access.

## Scope guardrails

- Keep the approved user interface and styling unchanged during backend and code cleanup.
- Keep the three user-facing areas: AI Chat, Editor, and Storage.
- Storage is a general-purpose file manager; do not require particular files, folders, notes, metadata, or knowledge structures.
- Project details may be kept in Storage if the user or AI finds that useful, but are never required to be files.
- Do not recreate a separate Details tab, panel, or mandatory details workflow.
- Do not add mandatory user-facing DNA, character, relationship, universe, or consistency-management areas.
- Do not remove working capabilities required by the three areas or foundation systems.
- Treat existing database migrations as deployed history; do not delete or rewrite them as part of ordinary source cleanup.
- Prefer removing obsolete application code only after its imports, API routes, tests, and database dependencies have been traced.
