# VYRA AI Operator — Vyral Creation

## Scope

This slice connects natural-language Vyral creation in AI Chat to the shared capability executor. It does not change the AI Chat or Master Editor UI.

## Flow

The browser no longer intercepts Vyral creation intents or performs the identity RPC directly. It forwards the conversation to the authenticated server tool flow; the existing AI Chat presentation and controls remain unchanged.

1. The authenticated chat model calls `propose_vyral_create` with the creator-chosen name and optional description.
2. The server validates bounded fields and creates a server-generated Vyral UUID and action plan.
3. The plan is stored as a `vyral.create` pending action, scoped to the authenticated user and exact conversation session. The preview does not create a Vyral row or DNA record.
4. A natural-language approval in the same chat is matched to exactly one unexpired pending action. The server re-reads and verifies the action, its capability, plan, user, session, and expiry.
5. The shared capability executor checks approval and owner authority. The adapter approves and claims the pending action through service-role-only lifecycle RPCs.
6. The adapter calls `create_vyral_identity_with_dna` through the authenticated user-scoped Supabase client. This invoker RPC uses `auth.uid()` and atomically creates a private Vyral identity plus its initial Root DNA record.
7. The server re-reads the Vyral and Root DNA through the admin client and only reports success after verifying exact owner, identity metadata, and exactly one Root DNA record.
8. The pending action is finalized with a bounded result summary. Proposal retries with the same idempotency key reuse only the same owner/session/name/description pending preview.

## Security boundaries

- No client-supplied owner ID, Vyral ID, action ID, or approval timestamp is trusted.
- The Vyral UUID is generated server-side and stored in the immutable pending plan.
- Approval must be in the same authenticated chat session and while the pending action is unexpired.
- A conflicting Vyral ID is rejected; uncertain retries can reuse only an exact same-owner identity created from the same draft.
- The atomic creation RPC is called with the user-scoped client because it is an invoker function that derives ownership from `auth.uid()`.
- The service-role client is used only for pending-action lifecycle, owner verification, and post-create verification.
- Initial DNA is identity DNA only; Asset DNA and automatically derived Master DNA updates remain separate follow-up work.

## Verification status

- Pure plan parsing, approval phrase, bounds, and exact retry-identity checks are covered by `tests/vyral-creation-action.spec.ts`.
- CI runs this test through `test:vyral-creation-action`.
- The Dev Edge Function has not been redeployed as part of this repository change.
- No OpenAI key/provider call, production database change, production function deployment, production deployment, or merge is performed here.
- Browser-level live approval testing remains pending until the platform OpenAI key is configured.
