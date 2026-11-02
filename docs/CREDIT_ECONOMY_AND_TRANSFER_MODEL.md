# VYRA Credit Economy & Account-to-Account Transfers

**Status:** Approved product direction; implementation and commercial parameters remain to be designed and verified.  
**Last updated:** 2026-11-03

## 1. Product decision

VYRA's current credit business model is **pay-as-you-go credit purchases**, not a mandatory monthly subscription.

- A customer can buy a small amount of credits whenever needed.
- Larger purchases should receive a better effective price per credit through volume-based discounts.
- Credit package prices, discount thresholds, minimum purchases and maximum purchases are not finalized. They must be based on measured provider costs, payment fees, taxes, refunds, abuse risk and sustainable margins.
- Customers spend credits on supported VYRA AI generation workflows.
- A mandatory monthly subscription is not required by this model. Do not present previously discussed subscription price examples as approved pricing.

## 2. One standard account type

All customers use the same ordinary VYRA account.

- Do not create a separate Reseller Account type or require a reseller role for basic credit transfers.
- A standard account can purchase credits for its own use.
- A standard account can send credits to another VYRA account.
- A standard account can receive credits from another VYRA account.
- Any future purchase tiers or volume discounts should be purchasing entitlements/pricing rules, not a separate account identity.

## 3. Account-to-account credit transfer

VYRA must provide a feature that lets one account transfer some of its available credits directly to another VYRA account.

Expected user flow:
1. The sender identifies the recipient using a stable VYRA identifier, such as username or account ID.
2. The sender enters the amount of credits to transfer.
3. VYRA displays the recipient identity and transfer amount for confirmation.
4. The server verifies the sender's identity, available balance, recipient account, transfer rules and request idempotency.
5. The server performs the debit and credit atomically. Either both sides are recorded, or neither side is.
6. Both accounts can see the completed transfer in their own transaction history.

The transfer feature is a movement of VYRA credits between customer accounts. It is not a payment transaction and does not itself prove that any external money changed hands.

## 4. External resale is outside VYRA

Users may independently agree with each other to exchange external payment for transferred credits, including reselling credits at a price they choose.

VYRA's responsibility for this product scope is to provide the account-to-account credit transfer capability and accurate transfer records. VYRA does not need to build or operate:
- An in-app reseller marketplace or listing system.
- External payment collection or escrow between users.
- User-defined resale pricing or price negotiation.
- Reseller commissions, seller payouts or withdrawal workflows.
- A separate reseller account type.

External arrangements are made independently by the users. The transfer UI should not represent an external payment as verified or protected by VYRA.

## 5. Credit accounting and safety requirements

Credit balances must be derived from a reliable server-side ledger or maintained transactionally with an immutable ledger as the audit source.

Required invariants:
- A user cannot transfer more than their available, unreserved credit balance.
- Sender debit and recipient credit happen in one database transaction.
- A transfer request has a unique idempotency key; retries must not duplicate a transfer.
- Every completed transfer records sender, recipient, amount, timestamp, status and a unique transfer reference.
- Users can read their own relevant transaction history but cannot create, edit or delete ledger entries directly.
- Browser-supplied balances or user IDs are never trusted as authority; identity and balance checks happen on the server.
- Concurrent transfers cannot overspend the same balance.
- Failed or rejected transfers must not leave a partial debit or credit.
- Administrative corrections use auditable compensating ledger entries, not silent balance edits.
- Credit transfers must not trigger AI generation or incur provider costs.

Credit purchase, generation reservation/settlement/refund and account-to-account transfer are distinct ledger event types. Provider-reported USD costs and customer credits remain separate units.

## 6. User-facing capabilities

The intended credit area should include:
- **Buy Credits:** purchase an available package or amount.
- **Volume Pricing:** show the effective price per credit for larger purchase quantities.
- **Credit Balance:** show available and reserved balances clearly where reservations are used.
- **Send Credits:** transfer credits to another VYRA account.
- **Receive Credits:** receive credits from another VYRA account.
- **Transfer Confirmation:** show recipient identity and amount before final submission.
- **Transaction History:** show purchases, generation usage, refunds/adjustments and transfers with clear statuses.

Do not expose a feature in the UI until its backend enforcement and end-to-end behavior are implemented and tested.

## 7. Decisions still open

The following values and policies are intentionally not decided yet:
- Credit package sizes and prices.
- Bulk-discount tiers and eligibility thresholds.
- Minimum and maximum transfer amounts.
- Whether transfers have fees or limits; default product intent is a straightforward credit transfer, with any fee requiring a separate explicit decision.
- Whether transferred credits retain the same expiry/refund restrictions as purchased credits.
- Purchase payment provider, refund policy and applicable tax handling.
- Whether any future optional subscription product is commercially useful.

Do not invent or hardcode these values as approved policy. Validate them against real provider economics and operational requirements.

## 8. Implementation status

This document records the approved product direction. It does not claim that credit purchasing, bulk discounts, account-to-account transfers, payments or production ledger enforcement are already implemented. Before launch, verify database migrations, server-side authorization, atomic transfer behavior, idempotency, concurrent-balance tests, transaction history, payment webhooks and production rollback procedures.

