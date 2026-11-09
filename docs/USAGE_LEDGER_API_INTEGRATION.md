# Usage Ledger API Integration Contract

## Status

This document defines the safe integration boundary for the usage and credit ledger foundation. It does not enable credit charging or change generation behavior.

**Current status (2026-11-03):** the full eight-migration chain, including the usage ledger, is applied to the separate `VYRA Development` project. All five database pgTAP suites pass there and GitHub CI passes. The production Supabase project has not received these migrations. The OpenRouter Text lifecycle is implemented, and a separate Google Gemini Text recorder is now implemented for automatic Asset/Vyral metadata suggestions. Full authenticated Development E2E testing remains in progress. No service-role key is exposed to the browser.

## Current provider behavior

| Capability | Synchronous result | Provider generation ID | Actual cost availability |
| --- | --- | --- | --- |
| Text chat | JSON response with token usage and optional cost | Response `id` (validated) | Optional provider usage cost |
| Image | JSON response with image payload and optional usage cost | `x-generation-id` response header | Optional response usage cost; metadata lookup can recover it |
| Speech | Binary audio response | `X-Generation-Id` response header | Not returned in the current speech response; read-only generation lookup may recover it |
| Video | Asynchronous/provider-specific response | Must be verified against the active video route contract | Must remain unknown until provider reports it |

A missing cost is represented as unknown/null. Estimates must never be copied into `provider_cost_records.actual_cost_usd`.

## First server integration increment

The OpenRouter Text chat route and the Google Gemini metadata-suggestion task now have opt-in usage-ledger integrations behind `VYRA_USAGE_LEDGER_ENABLED=true`.

When enabled, the route:
- Requires a valid Supabase access token and a request `Idempotency-Key`.
- Creates one `generation_jobs` row and one `provider_attempts` row before submitting to OpenRouter.
- Stores only safe request metadata (message count and character count), never the prompt transcript or BYOK key.
- Records actual provider-reported cost through the service-role-only RPC when the provider returns a finite, non-negative cost. Unknown cost remains absent.
- Marks failed or uncertain jobs distinctly. A repeated idempotency key is rejected before another provider request can be sent.

This increment records usage only. It does **not** reserve or charge customer credits. Google Gemini is tracked only for the `suggest_details` metadata task: a verified customer session and idempotency key are required, a `google` provider attempt is recorded, and Gemini token counts are stored when returned. Gemini does not currently return an actual USD cost in this integration, so actual cost remains unknown and no cost row is fabricated. Ordinary Gemini chat, Image, Audio, and Video generation remain blocked while the ledger is enabled until their own recording paths are verified. Keep the feature flag disabled until authenticated Development E2E testing is complete.

The Development schema already includes the service-role-only `apply_credit_ledger_entry()` RPC for `grant`, `reserve`, `commit`, `release`, `refund`, and audited `adjustment` entries. A server-only TypeScript wrapper now exists at `src/server/creditLedger.ts`, with typed validation and unit coverage. It is not mounted as a public API route and no provider-generation route calls it. This preserves the explicit boundary: BYOK requests are not charged VYRA credits, and VYRA-managed credit charging remains disabled until pricing, actual-cost reconciliation, customer consent, and refund rules are approved. See `docs/CREDIT_LEDGER_LIFECYCLE.md`.

## Required request lifecycle

1. Authenticate the customer server-side. Derive `user_id` from a verified Supabase access token; never accept a user ID supplied by the browser as authority.
2. Validate capability, model, project ownership, request parameters, and a client idempotency key.
3. Create or retrieve one `generation_jobs` row using the unique pair `(user_id, idempotency_key)`. Repeated submissions with the same key must not submit a second provider request.
4. Store the estimate status and estimated USD amount separately. An unavailable estimate remains null.
5. Create a `provider_attempts` row before provider submission. Do not store API keys, prompts containing secrets, or raw authorization headers.
6. Submit to the provider only once for the idempotent job. Persist the provider request/generation ID and safe status metadata.
7. Record actual cost only when a provider response or later authenticated provider lookup supplies a finite, non-negative amount. Use a stable idempotency key and provider generation ID to prevent duplicates.
8. Update job status independently from cost availability. A succeeded job can still have unknown actual cost.
9. If a credit reservation is eventually enabled, reserve before provider submission, commit only the consumed amount under a documented billing policy, and release unused reserved credits on definitive failure. An ambiguous timeout must not trigger an automatic second provider submission or a guessed refund.
10. Keep all financial writes in service-role-only server code. Browser sessions receive only user-scoped read access.

## Security and correctness invariants

- The browser never calls ledger RPCs directly and never receives the Supabase service-role key.
- Every write derives the customer identity from verified authentication.
- Every project reference is checked against the authenticated owner before job creation.
- Idempotency is enforced at the database boundary, not only in React state.
- Provider actual-cost records and ledger entries are append-only; corrections use compensating records.
- Provider usage payloads are allowlisted and bounded before storage.
- Provider errors and logs must not include API keys, access tokens, or full prompts.
- Estimated USD, provider-reported actual USD, and customer credits are separate units and separate fields. No implicit USD-to-credit conversion is allowed.
- No credit deduction is enabled until the product's credit price, rounding, refund, and user-consent policy is explicitly defined.

## Integration test matrix before production migration

- Missing/invalid Supabase access token is rejected.
- User A cannot create a job for User B's project or read User B's rows.
- Repeated idempotency key returns the same job and does not call the provider twice.
- A provider timeout leaves an explicit unknown/reconciliation state and cannot silently retry the paid request.
- Text/image/audio/video provider responses with missing cost preserve null actual cost.
- A provider-reported zero cost is accepted as zero; negative, NaN, Infinity, strings, and malformed values are rejected.
- Repeated provider cost ingestion is idempotent.
- A generation ID cannot be attached to a different customer's job.
- A succeeded generation with unknown cost remains successful and visibly cost-unavailable.
- Ledger reserve/commit/release operations are transactional and idempotent.
- Browser roles cannot invoke financial RPCs or write ledger rows.
- No production migration or credit charging occurs as part of test setup.

## Safe rollout sequence

1. Implement server-side authentication and job/attempt persistence behind a disabled feature flag (OpenRouter Text and Gemini metadata suggestions are implemented; remaining capabilities are gated).
2. Add mocked provider integration tests and authenticated tenant-isolation tests.
3. Verify each capability's provider request/response contract, especially asynchronous video and binary speech.
4. Deploy code with ledger writes disabled; confirm health and logs contain no secrets.
5. Apply the schema migration only after explicit production approval and a verified backup/rollback plan.
6. Enable usage recording for a controlled test account before enabling any customer-facing credit reservation.
7. Enable credit billing only after the credit policy and customer-facing disclosures are approved.

Until these gates are complete, the current local Provider Usage History remains informational and no credits are charged.


## Environment verification

- Development database schema and migration history are aligned with the repository.
- The five database test suites have been run against development and passed.
- Authenticated HTTP end-to-end tests with two dedicated development accounts are still required.
- Production migrations, production secret configuration, and customer-facing credit charging remain disabled/gated.
- The current Supabase organization is on the Free plan; leaked-password protection is a Pro-and-above Auth feature and is not available on this plan.
