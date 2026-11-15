# VYRA Product Direction — 2026-11-15

**Status:** Founder-approved product direction. This document supersedes older product-scope statements that conflict with it.
**Working branch:** `feature/my-storyboard`
**Release boundary:** Development/Preview only. No merge or Production deployment without explicit authorization.

## 1. Product purpose

VYRA exists to let creators move from an idea to finished media, edit and improve that media, maintain creative consistency across outputs, share their creative work and reusable creative worlds with other people, and publish to social platforms.

**VYRA is an All-in-One AI Creative & Publishing Platform.**

The end-to-end creator journey is:

**Idea → Create → Edit → Maintain Consistency → Share → Publish**

VYRA is not limited to an AI video generator, a prompt box, a single editor, a file manager, a DNA exporter, or a marketplace. These are capabilities within one connected creative product.

## 2. Experience principles

- **Natural-language first, not chat-only.** AI Chat is the central conversational interface for orchestrating supported VYRA tasks. Creators can also work directly in visual workspaces and editing tools.
- **One shared creative state.** Chat, projects, assets, storyboards, editing, consistency, sharing, and publishing must operate on the same authoritative data rather than disconnected copies.
- **Simple on the surface.** Creators describe the outcome they want. VYRA handles model selection, context retrieval, file processing, job orchestration, versioning, and validation behind the scenes.
- **Creator freedom.** Do not force every creation into a fixed genre, template, taxonomy, story structure, or relationship. Structures should adapt to the creator's work.
- **Honest capability status.** Distinguish implemented, verified, experimental, unavailable, and planned capabilities. Never display fake media, fake progress, fake metrics, or success without backend confirmation.
- **User control.** Require appropriate approval for paid generation, destructive changes, sharing permissions, purchases, and external publishing.

## 3. Core product systems

1. **AI Ideation** — brainstorm, research, explore directions, and turn approved ideas into plans.
2. **AI Creative Workspace** — create images, video, audio, text/documents, 3D and other supported media.
3. **Creative Editing** — edit existing or generated media, create versions and variations, and refine results.
4. **Creative Projects & Storyboards** — organize deliverables, scenes, production stages, and editable work.
5. **Creative Universe** — maintain reusable creative worlds and their characters, entities, locations, objects, stories, rules, relationships, timelines, and state.
6. **DNA & Consistency Engine** — preserve identity and continuity across media, edits, scenes, episodes, and collaborators.
7. **Asset & Media Library** — store, browse, organize, version, preview, and reuse original and generated media.
8. **Sharing & Collaboration** — share projects, universes, assets, and selected knowledge with controlled permissions and collaborative workflows.
9. **Creator Marketplace** — discover, publish, license, buy, and sell eligible creative resources and universes.
10. **Social Publishing** — prepare, approve, and publish finished content to connected social platforms.
11. **AI Workflow Orchestration** — coordinate multi-step work across the systems above, with visible progress, approvals, retries, and recovery.

These are product capabilities, not claims that every system is already implemented or ready for customers.

## 4. Universe: Creative World

A **Universe** is a reusable creative world: a creator-owned collection of creative knowledge and resources that can be used to produce consistent related work and can be shared with others under explicit permissions.

A Universe may contain or reference:
- characters, creatures, people-like fictional entities, and other reusable subjects;
- worlds, locations, environments, props, objects, costumes, and visual elements;
- stories, episodes, scenes, events, relationships, canon, rules, timelines, and evolving state;
- images, video, audio, documents, prompts, 3D models, animation, and other media;
- creator-approved facts, references, source assets, versions, provenance, and licensing.

No fixed category list or minimum structure is required. A creator may start with one character or one image and expand the universe over time. Relationship and story information is captured when supplied or reliably established; the system must not invent it to satisfy a schema.

**No custom `.vyral` extension or proprietary Universe package is part of the product direction.** A Universe is a first-class VYRA workspace concept managed directly in the app. Creators share or export the selected content through ordinary, familiar media and document formats, or through a standard archive only when a multi-file transfer is genuinely needed. Do not introduce a new extension or make users learn a VYRA-specific file type.

## 5. DNA, Fingerprints, and Consistency

- **Asset DNA** is the structured knowledge and useful generation guidance for one Asset. It is created and maintained automatically where supported.
- **Universe DNA** is derived from the universe's assets, entities, approved knowledge, relationships, canon, timeline, and state. It is not a manually maintained giant text field.
- **Fingerprint** supports integrity, identity, version comparison, and change detection. A fingerprint alone does not establish authorship or semantic similarity.
- **Consistency** means preserving the relevant approved traits and continuity, not forcing every output to be byte-identical. It includes appearance, voice, world rules, relationships, story canon, timeline, and changing state.
- Keep stable identity/canon separate from mutable state. For example, a character's injury may persist across episodes until a later event changes it.
- Retrieve only the context relevant to the current task. Use authoritative records, references, retrieval, validation, and correction loops; do not send the entire universe to every model call.
- Keep claims precise: exact source recovery, decoded-sample recovery, semantic reconstruction, and consistency generation are different outcomes. Do not promise 100% model consistency.
- DNA and fingerprints are internal infrastructure. Normal creators should not need to create, edit, understand, or troubleshoot DNA records.

## 6. Canonical data concepts

The implementation should converge on clear, connected concepts rather than duplicate stores:

- **Creative Project:** a deliverable or body of work being produced.
- **Universe:** reusable continuity, canon, knowledge, and shareable creative resources.
- **Asset:** an individual original, generated, imported, or edited media object with immutable versions and provenance.
- **Storyboard / Scene:** a planning and production structure belonging to a Creative Project.
- **Edit / Output Version:** a derived result with traceable source assets and edit/generation history.
- **Context Record:** approved facts, observations, relationships, and state used by consistency retrieval.
- **Share Grant / Collaboration Membership:** scoped access to selected resources and actions.
- **Publishing Job:** an explicitly approved external delivery operation with status and recovery data.

The exact database mapping must be established by auditing existing tables before migrations are designed. Do not create duplicate tables merely to rename concepts.

## 7. Provider and infrastructure direction

- OpenAI is the intended provider for AI Chat and language-based orchestration.
- Runway is the intended video-generation integration when that phase is reached.
- Media providers must be accessed through server-side adapters and centrally managed platform credentials. Customers should not need to bring their own API keys for the default experience.
- Keep provider selection, secrets, cost estimation, credit reservation, usage recording, retries, and result ingestion server-side.
- Preserve Supabase Auth, PostgreSQL, Row Level Security, private Storage, ownership checks, immutable asset versions, provenance, and financial ledger protections where they remain fit for purpose.
- Remain online-first. Do not add offline mode unless separately requested.

## 8. Product and technical cleanup rules

Every existing feature, screen, service, table, migration, test, and document must be classified:

- **KEEP:** directly supports the new creator journey or provides essential security, ownership, data integrity, billing/usage safety, or verified media foundations.
- **REFACTOR:** useful capability whose model, UX, or integration must be aligned with the new connected architecture.
- **REPLACE:** obsolete implementation that conflicts with the new product model and has a clear successor.
- **REMOVE:** duplicate, unreachable, fake, unused, or obsolete code/documentation after reference and data-dependency checks.

Do not delete user-owned assets, canonical records, protected samples, production data, applied migrations, financial ledger history, or security controls as ordinary code cleanup. Database changes must be additive or safely migrated in Development first. Historical migrations remain immutable; do not rewrite applied migration history.

## 9. Existing project guardrails

- Continue on `feature/my-storyboard`; do not create a new branch.
- Keep PR #122 open as Draft and unmerged until explicitly authorized.
- Never deploy to Production or modify the Production Supabase project without explicit authorization.
- Do not implement, modify, refactor, or otherwise touch `MasterTimelineEditor.tsx` (Master Editor).
- Do not change AI Chat UI while its current work is paused. The product architecture must still treat AI Chat as the central orchestration interface.
- Preserve ORIGIN-01 and its protected identity. Adapt its future test role to Asset integrity and Universe consistency without deleting its original source data.
- Do not introduce fake dashboard data or seeded demo content into a real customer account.
- Complete means UI, backend, database, security, error/success handling, CI, and Development end-to-end verification are all covered. Provider-backed checks must be clearly marked blocked when required credentials are absent.

## 10. Implementation sequence

1. Finish the read-only repository and Development-schema audit.
2. Produce the Keep / Refactor / Replace / Remove inventory with exact paths, tables, migrations, and dependency evidence.
3. Establish one authoritative architecture and update conflicting documentation.
4. Remove verified dead UI/code and obsolete product concepts without touching protected areas.
5. Refactor core data foundations: Project, Universe, Asset, versions, DNA/context, and consistency.
6. Connect creation and editing workflows to shared Asset and Project state.
7. Add scoped sharing and collaboration.
8. Complete marketplace and social publishing workflows.
9. Verify the customer journey end-to-end in Development before any release decision.

**Current status:** Direction approved; repository audit and cleanup are in progress. This document does not itself mark any feature complete.

## 11. Consistency-first Universe architecture — creator decision (2026-11-15)

**Consistency is VYRA's primary technical objective and must be treated as a platform-wide engineering foundation, not a secondary feature or a character-only capability.** The product should use the strongest practical, verifiable technology available at each layer. Do not claim that any model or technique guarantees perfect consistency; measure, validate, expose uncertainty, and improve through evidence.

### Creator experience

- A creator manages a Universe through a familiar File Manager experience: folders, files, Assets, search, move, rename, upload, and organize.
- Users are not required to manually author DNA, graphs, canon, timelines, state machines, or knowledge schemas.
- AI Chat is the required authoring/orchestration surface for establishing and evolving the Universe's semantic structure: meaning, entities, relationships, rules, canon, timeline, state, and consistency decisions.
- File organization alone does not automatically qualify a collection as a Universe. Qualification is based on whether the Universe has sufficient coherent, trustworthy, usable continuity context—not on the number of Assets or folders.
- A small Universe may qualify when its purpose and relevant continuity are coherent and usable. A large folder of unrelated files does not qualify merely because it contains many Assets.
- Users may still store and organize files before qualification. The system should explain what is missing and let AI Chat help establish it.

### Consistency engineering stack

1. **Source and version identity:** immutable Asset Versions, server-verified SHA-256, cryptographic fingerprints, and version-pinned evidence.
2. **Multimodal understanding:** modality-appropriate vision, audio, video, text, and structured-file analysis. Model observations remain observations until corroborated or explicitly adopted by the creator.
3. **Asset knowledge:** automatically maintained Asset DNA, technical metadata, semantic descriptions, identity traits, style/voice/behavior properties where relevant, and provenance.
4. **Universe knowledge graph:** typed entities and directed relationships, with evidence, ownership, source, confidence, and version applicability. Keep semantic relationships distinct from derivation/lineage.
5. **Continuity model:** explicit stable identity, canon/rules, temporal facts, mutable state, event ordering, and conflict/supersession semantics. Never collapse permanent canon and changing state into one field.
6. **Revisioned canonical snapshot:** immutable, integrity-verified Universe DNA revisions that pin exact Asset Versions and approved context. A stale or invalid snapshot must not be used as canonical context.
7. **Task-aware retrieval:** retrieve only relevant, authoritative context for the requested generation/edit task. Rank by semantic relevance, entity/relationship proximity, temporal applicability, evidence authority, and version freshness; enforce token and privacy boundaries.
8. **Generation constraints:** compile retrieved context into explicit positive requirements, negative constraints, references, and task-specific instructions for the selected media provider.
9. **Output validation:** compare generated outputs against the applicable identity, visual/audio traits, world rules, relationships, canon, timeline, and state. Use exact hashes only for byte/pixel integrity; use perceptual, embedding, feature, and model-based comparison for similarity/semantics, with separate calibrated thresholds.
10. **Correction loop:** classify mismatches, identify which source fact or generation constraint caused them, propose corrections, and update canonical knowledge only through the correct authority/approval path.

### Evidence authority and conflict policy

- Immutable source/version metadata and server-verified integrity are authoritative for file identity.
- Creator-confirmed facts and creator-adopted observations are authoritative only within their exact source Asset Version and SHA-256 scope.
- Independently verified evidence may be used according to its verifier and task scope.
- Unreviewed AI observations are provisional. Disputed, stale, unpinned, or conflicting observations must not silently become canon.
- A creator-approved fact about one Asset does not automatically certify the entire Universe or establish exact reconstruction.
- Every derived fact should retain provenance, source version, evidence status, and the reason it is applicable to the current task.

### Qualification and measurable quality

Universe qualification must assess coherence and operational readiness rather than inventory size. At minimum, evaluate:

- clear Universe purpose and intended creative use;
- reliable identity and source/version references for relevant Assets;
- sufficient approved semantic information for the intended scope;
- valid relationships and explicit handling of unknowns/conflicts;
- canon and state consistency where the Universe uses temporal or narrative continuity;
- a current, integrity-verified canonical snapshot;
- task-specific retrieval and validation readiness.

The system must support partial maturity and report missing evidence honestly. Do not invent a minimum Asset count or require every possible concept for every kind of Universe. A Universe about a single reusable object may need far less structure than a multi-character, multi-location serialized world.

### Current implementation boundary

The AI Chat context now verifies the Master DNA manifest digest and derived fingerprint against the stored revision row, and admits creator-adopted knowledge and creator-confirmed field evidence only when pinned to the exact Asset Version and source SHA-256 in the current snapshot. This is an initial consistency foundation, not completion of the full multimodal retrieval, generation, validation, or correction stack. Provider-backed behavior remains blocked until platform credentials and supported media integrations are configured.

