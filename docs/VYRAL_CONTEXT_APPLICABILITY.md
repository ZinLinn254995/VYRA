# VYRAL Context Applicability Contract

Updated: 2026-11-06

## Purpose

A creator may retain competing promoted values as context-dependent. A free-form context label is descriptive metadata, not a machine-readable authorization to apply a value.

## Structured creator tags

For a new `keep_contextual` conflict resolution, the creator must provide:
- A descriptive context label (1–300 characters).
- 1–12 explicit context tags.
- Each tag is normalized to lowercase and must be 1–64 characters.
- Allowed characters: lowercase letters, numbers, spaces, underscores and hyphens.
- Duplicate tags are rejected.
- Tags are creator-supplied claims; the system must never infer them from model output.

The server validates and stores the tags with:
- `creator_context_tags`
- `context_match_policy: exact_all_tags_required`
- `context_application_status: not_evaluated_no_runtime_context_evidence`

## Applicability rules

The tags do not currently activate a value. No runtime context resolver is connected yet.

A future evaluator may report a match only when independently sourced runtime context contains every required creator tag using exact normalized token equality. Partial, fuzzy, semantic, or inferred matches are not matches. Missing or ambiguous runtime context must produce `not_evaluated` or `no_match`, never a default preference.

A successful tag match is an applicability signal only. It does not establish factual correctness, ownership, global truth, or DNA completeness. It must not modify, delete, or overwrite source evidence or previous decisions.

## Immutable history and compatibility

- Existing resolution records remain unchanged and may have only a free-form label.
- New records append explicit tags; they do not migrate or reinterpret older records.
- A later decision is a new immutable record.
- Conflict decisions remain ineligible for DNA-only reconstruction.
- Context decisions apply only to the exact promotion records listed in their resolution payload.

## Current implementation boundary

The UI collects and displays explicit tags. The Edge Function validates and persists them. The UI explicitly states that tags are not applied because no independently supplied runtime context has been matched. There is no AI provider call or automatic semantic matching.
