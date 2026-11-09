# Vyral Creator Assistance and Quality Standards

**Status:** Accepted product/architecture direction; additive to the existing Vyral 100% workstream.  
**Scope:** Vyral creation guidance, evidence-based quality grading, creator-defined workflows, and the single VYRA AI Chat control surface.  
**Change rule:** This document extends the existing Asset DNA, Master DNA, Original Storage, Compact DNA, fingerprint, package, resolver, and licensing architecture. It does not replace or restart that work.

## 1. Product principle

VYRA does not aim to teach image/video generation models how to create. It helps people use capable existing AI models more effectively by supplying precise, relevant, version-pinned creative context.

Vyral is a creator-built collection of reusable Assets and their DNA. Creators may combine any supported file/asset types and may add optional descriptions, relationships, constraints, instructions, and reusable workflows. A Vyral may contain related or unrelated assets; it may be a single-asset collection; no story, character, world, role, purpose, relationship, or style structure is mandatory for Vyral validity.

Creator quality affects how useful a Vyral is for a particular task. More accurate and relevant source assets, DNA, references, instructions, and optional relationships can help a compatible generation model interpret the task and produce more consistent results. A high grade is evidence of readiness against a declared profile, not a guarantee that every model will produce a perfect result.

## 2. One control surface: VYRA AI Chat

VYRA AI Chat is the single conversational control center for VYRA operations. Do not introduce separate user-facing AI assistants or separate Chat modes for individual subsystems.

Through the same Chat, users can ask VYRA to:
- create, inspect, organize, update, and improve Vyrals;
- upload, select, classify, and manage Assets and Media;
- create or update Asset DNA and derived Vyral/Master DNA;
- inspect integrity, fingerprints, versions, reconstruction evidence, and package readiness;
- request Creator Assistant recommendations and quality evaluations;
- create or update creator-approved instructions and reusable generation workflows;
- prepare storyboards and creative projects;
- select relevant Vyral Assets and invoke connected generation providers/models;
- inspect results and continue editing.

Workspace, My Vyrals, Media Library, Storyboards, and profile/settings pages remain useful visual places to inspect and directly manage their respective content. They are not separate AI control centers. Chat must use explicit workspace/Vyral/Asset context and must not silently act on an ambiguous target.

Actions with external, irreversible, financial, publishing, licensing, sharing, or destructive consequences require the appropriate user authorization/confirmation. The Chat interface does not bypass existing authentication, ownership, access-control, license, or safety checks.

## 3. AI Creator Assistant lifecycle

The Creator Assistant is a capability within the existing VYRA AI Chat, not a separate assistant or mandatory wizard.

1. **Understand intent:** identify the creator's intended Vyral use and the task the Vyral should support. Ask only for information that is genuinely needed.
2. **Plan:** suggest useful asset types, references, metadata, optional relationships, instructions, and tests for that declared use. Suggestions must not become creator-confirmed facts automatically.
3. **Build with the creator:** organize uploaded/generated Assets, trigger supported deterministic DNA extraction, and help draft descriptions, relationships, instructions, and workflows. Preserve arbitrary files and creator freedom.
4. **Evaluate:** run the applicable versioned standard profile, deterministic validators, and any explicitly supported AI rubric evaluation.
5. **Explain and improve:** report passed, failed, blocked, not-applicable, and untested rules with evidence; recommend concrete improvements. Apply changes only within the user's request/authorization.
6. **Re-evaluate:** evaluate the new immutable/current snapshot and retain the grade history with the standard version and evidence.

The assistant must distinguish existing verified facts, creator assertions, AI suggestions, and unverified inferences. It must never invent missing Assets, DNA, relationships, rights, or reconstruction evidence.

## 4. Standard-based Quality Grading

### 4.1 Rules, not free-form opinion

Every grade must be computed against a versioned, explicit standard profile. An AI model may interpret semantic or qualitative criteria only through a declared rubric and must return criterion-level findings with evidence/reasoning. A deterministic evaluator validates rule IDs, required evidence, statuses, weights, applicability, hard gates, and score aggregation. The model must not assign an unsupported overall grade by intuition.

Every evaluation record should pin:
- Vyral ID and exact evaluated inventory/snapshot revision or fingerprint;
- standard profile ID and immutable standard version;
- evaluator/rubric version and, when used, AI model/provider metadata;
- per-rule status, weight, evidence references, explanation, and remediation;
- score calculation, grade, hard-gate result, limitations, and evaluation time.

### 4.2 Layered standard profiles

Use the relevant combination of:
- **Universal Vyral rules:** identity, inventory, version binding, DNA-record integrity, fingerprint consistency, package validity, provenance/license/access declarations where applicable.
- **Asset-type rules:** format-specific requirements for image, video, audio, document, prompt/instruction, 3D, animation, and future supported types. Do not apply image-only rules to an audio or arbitrary-file Vyral.
- **Declared-purpose rules:** optional readiness criteria for a creator's stated task, such as character consistency, music production, storyboard creation, or reusable document knowledge. These apply only when the creator selects or the task clearly requires that profile.
- **Workflow/generation rules:** instruction validity, required reference availability, model/provider capability, output constraints, and reproducible test results for a named workflow.

A mixed-media or arbitrary collection must be graded with applicable rules only. Missing optional story/character/world metadata must not lower a general-purpose Vyral grade unless the selected purpose/profile explicitly requires it.

### 4.3 Separate evidence classes

The evaluator must keep these claims distinct:
- deterministic software checks (hashes, file size/type, version links, schema validity, inventory and package checks);
- creator-declared facts (intended use, descriptions, rights declarations, relationships and instructions);
- AI-assisted semantic assessment (clarity, relevance, completeness for a declared purpose);
- observed generation-test results (measured output consistency/quality under a named model, settings, prompt and reference set).

AI semantic evaluation cannot replace deterministic verification. A generation test result applies only to the tested model/configuration and does not guarantee another model's result. No test performed must be reported as untested, not as passed.

### 4.4 Provisional grade bands

The following bands are a starting proposal and must be finalized as a versioned standard before being used as an authoritative production grade:

| Grade | Score | Meaning |
|---|---:|---|
| S | 95–100 | Exceptional readiness for the selected profile |
| A | 90–94 | Excellent readiness |
| B | 80–89 | Good readiness; limited improvements remain |
| C | 70–79 | Basic readiness; notable gaps remain |
| D | 50–69 | Significant improvements required |
| F | 0–49 | Minimum profile requirements not met |

A score is not sufficient by itself. Each profile must declare hard-gate rules. A failed mandatory integrity, identity, authorization, or required reconstruction rule can cap or block the grade regardless of the numeric score. The evaluation must show both the score and any cap/block reason. If evidence is insufficient, return **Not Evaluated / Incomplete Evidence**, not a guessed grade.

No grade may be advertised as a universal prediction of creative quality. Show profile and standard version beside every grade.

## 5. Creator-defined workflows and AI Chat package handoff

A creator may optionally define a default action or reusable workflow for a Vyral, such as "use this collection's selected character/style references to create a 30-second cinematic video." The workflow is portable declarative intent, not executable code and not an authorization token.

A compatible AI chat that receives a .vyral package should be able to:
1. parse and validate the package manifest and Compact DNA;
2. understand the creator's declared default workflow and available Assets;
3. match the user's request to only the relevant Asset IDs, versions, and relationships;
4. explain missing context or unavailable integrations;
5. retrieve omitted originals/reconstruction data only through a supported, user-authorized VYRA integration and applicable license/access policy;
6. invoke a generation tool only if that AI product exposes a compatible tool/model and the user authorizes the action;
7. report what was actually executed and which model/configuration was used.

Do not promise that uploading a package forces every third-party chat product to execute a workflow. Package interpretation, external tool calling, model availability, authentication, and user confirmation depend on the receiving product. The package must remain safe and understandable even when no remote resolver or generation tool is available.

## 6. Original and Compact DNA responsibilities remain unchanged

- Canonical Original Assets, Original/Full DNA, versions, and authoritative records remain in VYRA storage.
- Compact DNA is a portable navigation/reference map. It helps an AI understand the collection and select only relevant Assets; it does not replace the canonical original or grant access.
- The VYRA resolver returns only the exact permitted, authorized resources. Private resources remain private.
- Exporting Compact DNA never deletes or mutates canonical Original data.
- Reconstruction claims remain evidence-based: exact encoded-file recovery, exact decoded-sample recovery, structural/perceptual/semantic similarity, and newly generated consistency are different outcomes.

## 7. Acceptance criteria

This capability is not complete until tests prove:

1. One VYRA AI Chat can route supported VYRA tasks without creating separate AI chat surfaces.
2. Chat actions resolve explicit Vyral/Asset context and reject ambiguous or unauthorized targets.
3. Creator guidance is optional, non-destructive, and supports arbitrary/mixed/unrelated Asset collections.
4. The same standard version and evidence produce the same deterministic score/grade.
5. Every score component maps to a versioned rule and evidence; missing evidence never silently passes.
6. AI rubric output cannot override deterministic failures, hard gates, or access/license rules.
7. Asset-type and purpose-specific rules are applied only when relevant.
8. Grade history is pinned to the exact evaluated Vyral snapshot and standard version.
9. A creator-defined default workflow is declarative, portable, and cannot bypass authorization or tool availability.
10. Compact package upload without a resolver/tool remains interpretable and honestly reports unavailable operations.
11. Selective retrieval returns only the requested permitted Assets and verifies exact version/integrity.
12. Existing DNA, Original Storage, package, resolver, licensing, and ORIGIN-01 acceptance behavior remains intact.

## 8. Implementation boundary

This document records the accepted product contract. It does not claim the Creator Assistant, grading engine, generation handoff, or complete Chat orchestration is already implemented. Implement additively on the existing Vyral acceptance branch, preserve the existing DNA work, and verify each layer with automated tests before claiming readiness.
