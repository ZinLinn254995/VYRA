# VYRA Marketplace Blueprint (Exploratory)

Status: concept + UI exploration. Not a final commercial, legal, or payment specification.

## Product intent
Make VYRA a creator economy platform where creators can discover and buy reusable Vyrals. Marketplace is a discovery and licensing layer over the existing Vyral/consistency system, not a separate asset silo.

## Confirmed product decisions
- Visitors can browse and preview marketplace Vyrals.
- Buyers can purchase a Vyral directly using VYRA Credits.
- The owner/seller sets the price and the license/ownership terms before listing.
- Credit P2P trading is out of scope.
- Credits may be shared/transferred between users under the existing Credit Transfer rules; sharing is not a sale.
- Credits are purchased from VYRA/Platform Owner.
- Purchased Vyrals appear in the buyer's library and remain reusable according to the purchased license.

## Marketplace information architecture
1. Explore: featured, trending, newest, categories, search and filters.
2. Vyral detail: preview, creator, price, included assets, license summary, full terms and Buy action.
3. My Listings: seller's drafts, active listings, paused/sold items, edit listing.
4. My Purchases: owned Vyrals, license details, source creator, purchase history.
5. Sales & Earnings: sales, fees, net credit earnings, transaction history.
6. Seller setup: creator profile and payout/credit settlement readiness (platform-credit settlement initially).

## Listing model (conceptual)
- Vyral identity and immutable source/version reference
- Seller/creator identity
- Title, description, category, tags, preview media
- Price in Credits
- Listing status: draft, pending_review, active, paused, sold/retired
- License type and explicit permissions:
  - personal use
  - commercial use
  - modification/remixing
  - redistribution/resale
  - exclusive or non-exclusive grant
  - attribution requirement
  - duration/territory if applicable
- Ownership statement: creator retains copyright by default; transfer of copyright must be an explicit, separately reviewed option and must not be implied by purchase.
- Version and update policy; what happens to existing buyers when seller updates/removes a listing.

## Purchase flow
1. Browse and preview a listing.
2. Open detail and read the license before purchase.
3. Confirm price, current balance, and license terms.
4. Server validates listing availability, buyer balance, seller, and license snapshot.
5. Atomic transaction debits buyer Credits, records seller proceeds and platform fee, and creates a purchase entitlement.
6. Buyer sees the Vyral in My Purchases / their Vyral Library.
7. Receipt and immutable transaction/license snapshot are retained.

## Economy and trust rules
- Credit P2P marketplace is not implemented.
- Existing Credit sharing remains a separate feature and must not be represented as selling/trading.
- Seller proceeds are internal VYRA Credits in the initial concept; cash withdrawal is not assumed.
- Platform fee is configurable by owner/admin and visible before listing/purchase.
- Never trust client-side balance or price; all purchase accounting is server-side and atomic.
- Use idempotency keys, append-only ledger entries, and audit logs.
- Refunds/reversals must be explicit compensating ledger transactions, never destructive balance edits.
- Prevent self-purchase, duplicate purchase charging, stale-price purchases, and unavailable-listing purchases.
- Add report listing, moderation, dispute/refund policy, and creator verification as later trust features.

## Ownership and license safeguards
- Buying a Vyral grants only the permissions explicitly shown in the accepted license.
- Copyright ownership remains with the creator unless an explicit copyright transfer agreement is selected and accepted.
- The buyer's entitlement stores the exact license version accepted at purchase time.
- Library references must not mutate or overwrite the seller's original Vyral.
- Exclusive license availability requires server-side checks and prevents conflicting later sales.
- Seller must confirm they have rights to all included materials.

## Initial UI prototype scope
- Marketplace entry in Workspace navigation.
- Explore grid with sample Vyrals, category chips, search, price, creator, and license summary.
- Detail preview drawer/modal with terms and Buy action.
- Tabs for Explore, My Listings, My Purchases, Sales.
- Demo-only interactions may update local UI state; no real charges, listings, purchase entitlements, escrow, or seller settlement are performed by this prototype.

## Later implementation phases
1. Discovery UI and product-owner feedback.
2. Listing schema + seller controls + moderation.
3. Credit ledger integration and atomic purchase endpoint.
4. Purchase entitlement + Vyral Library integration.
5. Seller earnings, platform fee, receipts, refund/dispute handling.
6. Security, abuse prevention, legal/license review, tests and launch gates.

## Open decisions for later discussion
- Whether exclusive and non-exclusive licenses are both offered at launch.
- Whether copyright transfer is ever offered or only usage licenses.
- Exact fee, minimum/maximum prices, refund rules, and review requirements.
- Whether sellers can edit a listing after sale and how buyers are protected from version changes.
- Whether seller earnings remain spendable Credits only or cash-out is introduced later.
