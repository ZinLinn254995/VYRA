# Universe Terminology and Legacy Compatibility Audit — 2026-11-15

**Status:** Founder-approved terminology decision; implementation audit in progress.
**Working branch:** `feature/my-storyboard`
**Release boundary:** Development/Preview only. No merge or Production deployment without explicit authorization.

## 1. Canonical product terminology

Use **Universe / Universes** for creator-facing product language. A Universe is an in-app creative space that can organize folders, files, Assets, and related creative knowledge. It is not a proprietary file format, a DNA-only package, or merely a collection of characters.

A Universe may contain mixed media and creator-defined material: images, video, audio, documents, prompts, 3D assets, entities, locations, props, stories, relationships, canon, timeline, and evolving state. Do not require a fixed taxonomy, genre, story structure, or mandatory relationship metadata.

## 2. File and transfer policy

- Do not create or promote a new `.vyral` extension.
- Do not create a proprietary VYRA Universe archive format.
- Keep each Asset in its ordinary media/document format.
- Offer standard-format downloads for individual files.
- Use a standard ZIP archive only when a user intentionally transfers multiple selected files/folders and a multi-file container is useful.
- A standard ZIP is transport only; it is not the canonical Universe or a replacement for its database identity and permissions.
- Keep legacy `.vyral` import only as a temporary backward-compatibility path where needed. Label it clearly as legacy and never present it as the normal new export workflow.

## 3. Existing implementation findings

The following creator-facing changes have already been made on the working branch:

- Profile and Workspace entry labels use **My Universes**.
- Marketplace empty-state copy uses **Universes**.
- AI Chat navigation/action copy recognizes **My Universes** and natural-language Universe requests.
- The old custom package export action has been retired from the Details UI; the visible export affordance is disabled and states that standard export is coming later.
- Legacy package import remains available for compatibility.
- Existing database and service identifiers have not been mass-renamed.

## 4. Legacy references that must not be blindly renamed

Repository search still finds legacy terms in several categories:

1. **Database schema and migrations:** tables such as `public.vyrals`, foreign keys, triggers, RLS policies, storage bucket/path conventions, and RPC parameters. These are connected to existing user data and security boundaries.
2. **Internal application contracts:** TypeScript types, service names, Edge Function names, payload fields, IDs, and stored JSON properties such as `vyral_id` and `manifest.vyral`.
3. **Historical package support:** validators, schemas, import logic, fixtures, and compatibility code for previously exported `.vyral` packages.
4. **Historical documentation:** older package-first, external reconstruction, and Vyral DNA documents that conflict with the approved Universe product direction.
5. **Creator-facing copy:** any remaining labels, descriptions, errors, accessibility labels, navigation names, or instructions that expose the old term to users.

Do not rename database tables, columns, storage buckets, Edge Functions, or persisted JSON keys until a dependency and migration audit proves a safe additive migration path. Historical migrations must remain immutable. Preserve all existing IDs, Assets, DNA, fingerprints, provenance, licensing, share grants, and protected ORIGIN-01 data.

## 5. Documentation supersession

The current product direction in `docs/VYRA_PRODUCT_DIRECTION_2026-11-15.md` is authoritative when older documents describe a custom package as the product's primary Universe representation, require external DNA-only reconstruction, or treat a Universe as a proprietary Vyral collection.

Older technical specifications may still describe the implementation that exists today. They must be read as historical implementation records, not as approval to continue the retired product direction. Update them in place only after checking whether they are still referenced by tests, code generation, migrations, or operational procedures.

## 6. Required follow-up audit

- Search all user-visible strings and remove remaining Vyral terminology from active UI.
- Trace every new package export entry point, not only the Details page button, and ensure no alternate route can create a proprietary package.
- Inventory legacy import dependencies and keep the importer isolated, clearly labelled, and tested against existing packages.
- Map the current `vyrals` schema and related tables to the in-app Universe concept without changing production or existing data.
- Verify Asset-to-Universe membership, folder hierarchy, asset versions, ownership/RLS, sharing, and protected sample behavior.
- Design standard single-file and multi-file ZIP export with permission checks and safe filename handling.
- Reconcile old product documents with the approved Universe direction without rewriting applied migrations or deleting useful technical history.
- Run CI, browser, and database tests on the current branch and report their actual conclusions.

## 7. Guardrails

- Continue on `feature/my-storyboard`; do not create another branch.
- Keep PR #122 Draft and unmerged until explicitly authorized.
- Do not deploy to Production or modify the Production Supabase project.
- Do not modify or refactor Master Editor code.
- Do not change AI Chat UI while its visual work remains paused.
- Preserve ORIGIN-01 and all user-owned records.
- Do not claim a test passed unless its current workflow result is verified.
