# Universe & Consistency Intelligence Architecture

Status: **Current accepted product direction. This supersedes earlier Vyral/.vyral product terminology and packaging proposals.**

## 1. Product definition

The user-facing concept is **Universe**. A Universe is a real, persistent creative environment organized like a familiar file manager: folders, files, original Assets, immutable Asset versions, automatically maintained knowledge, and optional relationships/canon/timeline/state/rules.

A Universe is not a DNA-only document, not a fixed template, and not a mandatory story/character schema. A user may create a Universe containing one Asset, unrelated Assets, or a deeply connected story world. Do not force classifications or relationships the creator has not supplied and the requested task does not require. Do not introduce or revive a `.vyral` file/export format.

## 2. Accepted terminology

- **Asset:** uploaded, generated, imported, or edited creative file/resource.
- **Asset DNA:** machine-readable identity, structure, semantic knowledge, reconstruction data/references, and evidence for one Asset/version.
- **Universe Knowledge:** accumulated facts about a Universe, derived from Asset DNA, verified observations, creator declarations, and activity history.
- **Universe DNA:** automatically maintained, versioned aggregate/projection of relevant Universe Knowledge, Asset inventory, and cross-Asset constraints. It never replaces the actual Assets.
- **Fingerprint:** integrity/identity/change evidence for exact content or a defined snapshot; not proof of ownership or authorship.
- **Canon:** creator-approved facts/rules within a declared scope.
- **Timeline:** ordered events and temporal relationships.
- **State:** known entity/world state at a point or event (appearance, location, possession, damage, status, etc.).
- **Relationship Graph:** explicit or evidence-backed typed links. Empty or partial graphs are valid.
- **Consistency Intelligence:** resolves applicable knowledge and constraints for generation/editing, checks outputs, and learns from verified changes without silently rewriting canon.

## 3. Architecture

### 3.1 Asset source-of-truth layer

Original files and immutable versions remain authoritative. Each supported Asset/version receives its own DNA, fingerprint, provenance, and extraction status. Distinguish deterministic byte-derived facts, model observations, creator declarations, generated hypotheses, and reconstruction evidence. Failed/incomplete extraction must never be represented as complete.

### 3.2 Universe Knowledge layer

Derive knowledge from verified Asset metadata/DNA, generation/edit provenance, creator-approved canon/rules, accepted multimodal observations, timeline events/state transitions, and relationships. Each knowledge item should carry stable identity, subject/type/value, scope, source references, evidence class, confidence/status, temporal validity, revision, and conflict state.

Never infer creator intent, canon, or relationships solely from filenames or folder proximity. AI suggestions remain proposals until accepted when they change creator-owned facts.

### 3.3 Universe DNA projection

Universe DNA is a deterministic, versioned projection of eligible Universe Knowledge and Asset inventory. It references rather than duplicates original binaries. It pins the exact Universe snapshot, included Asset/version/DNA references, knowledge/relationship revisions, applicable canon/rules and timeline/state references, provenance/access policy, digest/fingerprint, and unresolved conflicts.

Source changes invalidate dependent projections. Historical snapshots remain immutable. An aggregate's existence does not mean every Asset or fact is verified.

### 3.4 Task-scoped context resolver

For each generation or editing request:
1. classify the operation and identify referenced entities/assets/scenes;
2. resolve direct Asset references and exact versions;
3. traverse only relevant relationships, canon, timeline, and state dependencies;
4. apply creator rules by scope and priority;
5. include provenance/evidence and uncertainty for material facts;
6. detect contradictions or missing critical context before generation;
7. produce a bounded provider-neutral context package and adapter-specific controls.

Context selection must be explainable and reproducible. Cache by task inputs plus relevant Universe/Asset revisions; invalidate on dependency changes. Unknown or ambiguous facts stay unknown; do not silently guess. Never send the entire Universe when only a subset is relevant.

### 3.5 Generation/edit consistency loop

Use one shared loop for creation and editing: **Preflight → Plan → Execute → Inspect → Reconcile → Commit → Update**.

- Preflight checks references, constraints, temporal/spatial state, rights, and provider capability.
- Plan declares selected references, expected changes, and protected invariants.
- Execute passes minimum necessary context to the provider.
- Inspect evaluates the output against applicable constraints.
- Reconcile reports pass/warning/conflict/not-evaluable; a model cannot self-certify unsupported facts.
- Commit stores a new Asset/version with provenance and proposed knowledge/state changes.
- Update appends accepted observations/events and rebuilds only affected Universe projections.

Edits preserve unrelated facts/assets. Intentional canon/state changes become new events/revisions.

## 4. Consistency dimensions

Evaluate only dimensions relevant to the task: identity/appearance; environment and spatial layout; scale/proportions/materials/colors/style; wardrobe/props/possession/condition; timeline/age/weather/lighting/time-of-day; state transitions/causal continuity/event order; camera/framing/motion/action; voice/speech/music/ambience/sound design; exact versions/provenance/permissions.

Scene-to-scene continuity is one use case, not the full definition. The same intelligence should support standalone images, video edits, audio, documents, 3D, and mixed-media workflows where applicable.

## 5. Conflict and precedence

Keep provenance and scope explicit; do not flatten all facts into one prompt. Apply authenticated task/access/rights constraints, creator-locked applicable canon, verified task-specific state and exact references, other verified evidence matching temporal/context scope, creator preferences, then untrusted model hypotheses.

If two applicable locked facts conflict, block or request a decision. Time-scoped facts may both be valid at different times. Context-specific facts coexist only when applicability is explicitly established.

## 6. Performance and reliability

Keep the user experience simple: users organize folders/files and use AI Chat; VYRA handles extraction, indexing, retrieval, and checks. Use bounded retrieval, typed indexes, dependency-aware invalidation, incremental updates, and revision-keyed caches. Reuse stored knowledge while Asset versions are unchanged; rerun expensive multimodal analysis only when needed. Track latency, context/token size, retrieval count, evaluator cost, and cache hit rate. Degrade gracefully and disclose unevaluated dimensions. Never promise mathematically perfect output from stochastic third-party generators; measure task-specific consistency and improve through references, controls, iteration, and evidence.

## 7. Legacy compatibility

The repository contains legacy identifiers such as `vyrals`, `vyral_assets`, `vyral_dna_records`, and `build-vyral-master-dna`. These are implementation/storage identifiers, not product vocabulary. Do not bulk-rename database tables or break IDs, RLS, storage paths, ORIGIN-01 protection, or APIs as part of terminology correction. Introduce Universe-facing contracts/UI incrementally. New user-facing language must say **Universe**, **Asset DNA**, and **Universe DNA**. No `.vyral` portable format is part of the current direction.

## 8. Implementation sequence

1. Audit UI/types/services/database/AI tools and map legacy collection concepts to Universe.
2. Add a non-destructive Universe domain adapter over canonical records.
3. Define typed Universe Knowledge with provenance, evidence, scope, temporal validity, and conflict state.
4. Implement deterministic task-scoped context resolution with dependency-aware retrieval/cache keys.
5. Connect generation and editing preflight/inspection to the same resolver.
6. Record output provenance and append accepted timeline/state/knowledge changes.
7. Add tests for conflicts, temporal applicability, selective retrieval, stale revisions, privacy, and degraded evaluation.
8. Update UI terminology while preserving existing data/workflows.

## 9. Implementation status

Existing foundations include Asset DNA, Master DNA persistence/building, fingerprints, semantic relationships, generation lineage, context-applicability helpers, and a storyboard-level consistency resolver. These do not prove the full Universe Consistency Intelligence system is implemented.

`src/services/consistencyEngine.ts` currently resolves selected storyboard references/rules and audio continuity. It is not yet a universal resolver across arbitrary Assets, timeline/state, and all generation/edit operations. Keep this distinction explicit in status reports and acceptance tests.
