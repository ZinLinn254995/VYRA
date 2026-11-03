# Credit Ledger Lifecycle

## Status (2026-11-03)

The Development database already contains the append-only \`credit_ledger_entries\` table and the service-role-only \`apply_credit_ledger_entry()\` RPC. The server now has a typed wrapper in \`src/server/creditLedger.ts\` for the existing RPC.

This is infrastructure only:
- No public HTTP endpoint exposes financial writes.
- No provider-generation route calls the credit ledger wrapper.
- No customer credits are reserved, committed, released, granted, or refunded automatically.
- The BYOK path remains provider-billed to the customer's own OpenRouter account and must not consume VYRA credits.
- Production schema and balances remain untouched.

## Entry semantics

All amounts are integer credit units represented as decimal strings at server/API boundaries to avoid JavaScript number precision loss.

| Entry | Available delta | Reserved delta | Purpose |
| --- | ---: | ---: | --- |
| \`grant\` | +N | 0 | Server-authorized credit issuance after a verified purchase or approved promotion |
| \`reserve\` | -N | +N | Hold a maximum charge before a VYRA-managed provider request |
| \`commit\` | 0 | -N | Settle the consumed portion of an existing reservation |
| \`release\` | +N | -N | Return the unused reserved portion |
| \`refund\` | +N | 0 | Compensating credit entry for an approved refund |
| \`adjustment\` | +/-N | 0 | Audited manual correction; negative values are allowed only for this type |

The database function uses a per-user advisory transaction lock, a unique \`(user_id, idempotency_key)\` constraint, and a job-scoped reserved-balance check. Ledger entries are immutable; corrections use compensating entries.

## Server wrapper contract

\`applyCreditLedgerEntry(input, options)\`:
- Requires server-side \`SUPABASE_URL\` and \`SUPABASE_SERVICE_ROLE_KEY\`.
- Calls only \`/rest/v1/rpc/apply_credit_ledger_entry\`.
- Derives no identity from browser-supplied input by itself; future route callers must pass the ID from a verified Supabase session.
- Validates UUIDs, positive integer amounts, signed int64 bounds, action/job requirements, idempotency keys, note length, and bounded metadata.
- Rejects metadata keys that look like API keys, tokens, secrets, passwords, prompts, messages, or content.
- Uses \`no-store\`, an 8-second timeout, and returns only a safe ledger-entry projection.
- Maps insufficient balance, reservation conflicts, and idempotency conflicts to typed results.
- Is server-only and must never be imported by browser components or bundled into client code.

## Required VYRA-managed generation lifecycle

1. Verify the customer session and derive the owner ID.
2. Create one idempotent generation job and calculate the maximum customer-credit reserve from a published VYRA pricing rule. Never accept a customer-supplied reserve amount as authoritative.
3. Confirm that the customer has accepted the displayed maximum charge and the relevant refund/timeout policy.
4. Reserve the maximum amount before submitting a VYRA-managed provider request.
5. Submit to the provider once. Do not automatically resubmit a paid request after an ambiguous timeout.
6. When actual provider cost is known, convert it using the approved VYRA pricing rule and commit only the consumed amount.
7. Release the unused reserve. If actual cost remains unknown, leave the job in reconciliation state and do not guess a final charge.
8. If a definitive provider failure qualifies for a refund, append a compensating \`release\` or \`refund\` entry according to whether the credits were still reserved or already committed.
9. Persist the provider USD cost separately from customer credit units. Never infer provider actual cost from an estimate.

## BYOK vs VYRA-managed billing

- **BYOK:** the customer supplies their own provider key; OpenRouter bills the customer directly. VYRA may record usage/cost metadata for the customer's history, but does not deduct VYRA credits.
- **VYRA-managed:** VYRA supplies the provider key and bears provider cost. Only this path may eventually reserve and commit VYRA credits, after the commercial policy is approved.

## Commercial and launch gates

Do not enable customer credit charging until all are complete:
- Define the credit-unit conversion, displayed prices, rounding rules, and bulk-discount tiers.
- Verify actual provider costs and account for provider price changes, taxes, payment fees, refunds, chargebacks, and FX where applicable.
- Publish clear maximum-charge consent before a paid generation starts.
- Define definitive failure, ambiguous timeout, cancellation, partial output, and refund handling.
- Add payment checkout and signed webhook processing with idempotent purchase grants.
- Complete authenticated Development end-to-end tests for reserve/commit/release/refund, duplicate webhooks, duplicate generation requests, insufficient balance, concurrent reservations, and recovery after provider timeouts.
- Verify backup/restore and obtain explicit approval before any Production migration or secret configuration.

The intended commercial model is pay-as-you-go purchased credits with optional bulk discounts, one standard account, and account-to-account credit transfers. A mandatory monthly subscription is not part of the current plan. Credit transfers do not create marketplace seller balances, commissions, or payouts.

Until the pricing, cost, consent, and refund gates are verified, the lifecycle wrapper remains inactive and no customer is charged.
