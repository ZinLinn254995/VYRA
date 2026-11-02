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

External arrangements are made independently by the users. The transfer UI should not represent an external payment as verified or protected by VYRA. This product boundary is not a legal conclusion that VYRA has no responsibility for activity enabled by its transfer feature. Before enabling transfers or marketing resale-related use, obtain qualified legal and payment-provider review for Thailand and every intended target market, and document any required restrictions, monitoring, reporting and customer disclosures.

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

### 5.1 Double-entry transfer invariant

A completed transfer must be represented by a balanced pair of immutable ledger entries:

- One debit against the sender's credit liability/balance.
- One equal-value credit against the recipient's credit liability/balance.
- Both entries share the same unique transfer reference and commit in the same database transaction.
- For every transfer reference, the sum of the signed credit movements must equal zero. A transfer cannot be marked completed unless both entries exist and reconcile.
- The transfer record is the business event; ledger entries are the accounting evidence. Neither should be independently editable by a customer.
- Reversals and administrative corrections use linked compensating entries. Never rewrite or delete the original transfer entries.

The implementation must define whether balances are calculated from the ledger or maintained as transactionally updated cached totals. If cached totals are used, automated reconciliation must detect any mismatch against the immutable ledger.

### 5.2 Credit provenance, refunds and chargebacks

Purchased credits, promotional/bonus credits and manually granted adjustment credits must remain distinguishable in the ledger. Preserve provenance through transfers so the system can answer where a balance came from and apply any applicable restrictions consistently.

- Do not silently convert promotional credits into purchased credits, or vice versa.
- A transfer must preserve the source classification and any expiry or restriction metadata; the final expiry and restriction policy remains a launch decision.
- A refund must create auditable compensating entries and identify the original purchase and any affected credit lots. Never erase the purchase history.
- Before launch, define how refunds work when purchased credits have already been spent or transferred, and whether recipients can spend transferred credits before the original purchase is final.
- For a payment chargeback, preserve all records and place appropriate risk controls on the affected account(s) while the case is reviewed. Do not silently claw back credits from an unrelated recipient or create an undocumented negative balance.
- The exact treatment of already-spent or onward-transferred credits, account restrictions, appeals and any recovery of a deficit must be approved as a written policy before accepting real payments.

### 5.3 Transfer privacy, confirmation and abuse controls

- Use a public, stable VYRA username or transfer identifier for recipient discovery. Do not require users to expose or search by private email address.
- Return only the minimum recipient details needed for confirmation. Before submission, show a clear recipient identifier/display name, amount and any applicable fee; require an explicit final confirmation.
- Validate that the amount is a positive integer in the smallest supported credit unit, within configured minimum/maximum limits, and that sender and recipient are different eligible accounts.
- Enforce authorization, rate limits, velocity/abuse monitoring and configurable account-level transfer limits on the server. Do not rely on disabled UI controls.
- Protect against recipient enumeration with privacy-preserving lookup responses and rate limits. Avoid revealing whether a private email or account exists.
- Define handling for suspended/closed accounts, mistaken transfers, compromised accounts, suspicious patterns and support disputes before launch. A completed transfer is not automatically reversible; corrections require an auditable compensating transaction and authorized review.
- Use database locking or an equivalent serializable/conditional balance update so simultaneous requests cannot spend the same available credits twice.

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

