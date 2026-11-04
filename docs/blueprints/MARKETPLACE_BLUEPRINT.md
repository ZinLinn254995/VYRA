# VYRA Marketplace & Vyral Licensing Blueprint

Status: confirmed product-direction notes and exploratory blueprint. This is not a final legal, tax, or payment specification. Implementations must preserve the product decisions below and receive separate review before production launch.

## Product intent

VYRA is a creator economy platform where creators can build, share, discover, buy, reuse, and branch Vyrals. A Vyral is a flexible Creative Asset Universe, not a fixed template or a single media file.

Creators may place any useful content inside a Vyral, including:
- Images, video, audio, music, voice, animation
- Text, scripts, stories, documents, PDFs, and other files
- Characters, locations, worlds, props, 2D/3D models, and other creative assets
- Rules, instructions, prompts, style guides, consistency rules, and production notes
- References, links, and other supporting material
- Future asset types without requiring a rigid predefined template

Creators decide how complete, organized, and valuable their Vyrals are. VYRA should provide flexible tools rather than force every creator into one structure.

## Confirmed marketplace decisions

- Visitors can browse and preview marketplace Vyrals.
- Buyers can purchase a Vyral directly using VYRA Credits.
- The owner/seller sets the price and the available license offers/permissions before each purchase.
- One Vyral may be offered under multiple licenses at different prices.
- Each buyer's rights are determined by the exact license and terms accepted at that buyer's purchase time.
- Later changes to price or license apply to later purchases only. They do not retroactively change earlier buyers' purchase terms.
- Credit P2P trading is out of scope.
- Credits may be shared/transferred between users under existing Credit Transfer rules; sharing is not a sale.
- Credits are purchased from VYRA/Platform Owner.
- Purchased Vyrals appear in the buyer's library and remain available according to the purchased license and platform functionality.

## Vyral licensing model

The initial license model has three core levels. Creators may offer one, several, or all of them, and set a separate price and clear terms for each offer.

### 1. Basic — Use the Vyral as supplied

- Buyer can use the purchased Vyral and its included library assets.
- The Vyral Library package is immutable for this license: buyer cannot add assets to it, remove assets from it, or modify/replace its stored assets or rules.
- Generation is still flexible at the output level. For example, if a character's canonical Vyral asset has red trousers, a buyer may prompt a generated video to show that character wearing blue trousers for that particular generated output.
- Such a generation variation does not edit or save over the canonical asset in the purchased Vyral Library.
- Basic does not grant in-VYRA Clone/Fork/Branch editing rights or derivative-Vyral resale rights.

### 2. Modification — Clone / Fork / Branch

- Buyer can create a separate working copy/branch from the exact purchased Vyral version.
- The purchased source version must remain preserved as an immutable snapshot; modifications happen in the buyer's own derivative copy, never by overwriting the creator's original.
- Buyer may modify existing assets, add new assets, extend rules/content, and develop one or more branches.
- Modification rights do not automatically include the right to list or sell the modified Vyral in the VYRA Marketplace. That requires the separate resale permission below.

### 3. Modification + Resale — Derivative Marketplace resale

- Includes the Modification rights above.
- Buyer may list and sell their modified/derivative Vyral in the VYRA Marketplace, within the permissions actually granted by the source license and any other included asset rights.
- A derivative listing must clearly identify itself as modified/derivative, not as the untouched original.
- The listing must expose its source lineage and allow a buyer to navigate back to the original Root Vyral and relevant parent versions.
- The derivative creator may define the price and license offers for their own contribution/derivative, but cannot grant rights over source materials or third-party materials beyond the rights they actually hold.
- A downstream buyer's rights are governed by the license snapshot accepted for that downstream purchase, together with the applicable source-rights chain.

## Purchase-time license lock

Every purchase is a separate transaction and a separate accepted license agreement within VYRA.

At purchase time, store an immutable snapshot containing at least:
- Vyral ID and exact source/version ID
- Seller/creator identity
- Selected license type and complete accepted terms
- Price and currency/credit amount
- Purchase timestamp and transaction/receipt ID
- Any applicable parent/root lineage and included-rights metadata

If a creator later changes license terms, permissions, or price:
- The new terms/prices apply to future purchases only.
- Existing buyers retain the terms captured in their own purchase snapshot.
- Existing buyers do not gain new permissions merely because the creator later offers a broader license.
- Existing buyers do not lose their previously purchased permissions merely because the creator later offers a narrower license.
- Different buyers may legitimately hold different rights to the same Vyral because they purchased under different offers at different times.

## Derivative identity, Root, and lineage

VYRA must preserve the relationship between an original Vyral and all derivative Vyrals created from it.

- The original creator's source version is the immutable Root/source snapshot for that lineage.
- Clone/Fork/Branch creates a distinct derivative identity; it must not mutate the source.
- Each derivative records its direct parent and original Root, plus the exact source snapshot used.
- Further branches continue the chain, so lineage can be traversed from any derivative back to the original Root.
- Marketplace pages for derivatives must clearly label them as modified/derivative and provide a visible route to view the Root and lineage.
- Buyers must not be misled into thinking a derivative is the untouched original.
- Keep a change summary or version history so buyers can understand what the derivative creator changed.

## Creator pricing and license offers

- A creator can offer one Vyral under multiple license options, each with its own price and permissions.
- Example options may include Basic, Modification, and Modification + Resale; these are starting categories, not mandatory fixed packages.
- Creator controls the price and terms of each offer, subject to platform-level safety, technical, and applicable legal requirements.
- The marketplace must show the exact included permissions and restrictions before purchase, not rely on a license name alone.
- A buyer selects the offer that matches their intended VYRA use.

## VYRA platform boundary policy

The creator/owner-defined VYRA license rules are platform rules for activities and entitlements inside VYRA. VYRA will not attempt to police or control how people use external social platforms or external AI tools.

- VYRA will not impose its internal creator license checks on posting to TikTok, YouTube, Facebook, or other external platforms.
- VYRA does not promise it can prevent screenshots, screen recordings, reference capture, or recreation from marketplace previews.
- People may use external tools and AI systems outside VYRA; VYRA does not operate an external-use enforcement system.
- VYRA's internal license and lineage controls govern VYRA marketplace transactions, VYRA library entitlements, and VYRA's own Clone/Fork/Branch/resale features.
- This platform boundary is a product policy. It does not override applicable law or eliminate non-waivable legal responsibilities. Creators remain responsible for submitting material they are entitled to upload and offer within VYRA.

## Marketplace information architecture

1. Explore: featured, trending, newest, categories, search, and filters.
2. Vyral detail: preview, creator, included content, Root/lineage when relevant, available license offers, price, full terms, and Buy action.
3. My Listings: seller drafts, active listings, paused/sold items, and listing editor.
4. My Purchases: owned Vyrals, exact purchased license, source creator, source version, and purchase history.
5. My Derivatives: cloned/forked/branched Vyrals, parent/root lineage, and derivative status.
6. Sales & Earnings: sales, fees, net credit earnings, and transaction history.
7. Seller setup: creator profile and credit settlement readiness (platform-credit settlement initially).

## Listing model (conceptual)

- Vyral identity and immutable source/version reference
- Seller/creator identity
- Title, description, category, tags, preview media
- Price per license offer
- Listing status: draft, pending_review, active, paused, sold/retired
- One or more license offers, each with:
  - License name/type and complete human-readable terms
  - Use permissions
  - Basic vs modification/clone/fork/branch permissions
  - Derivative resale permission
  - Commercial-use terms if offered
  - Attribution requirements if offered
  - Any other VYRA-internal permissions or limitations
- Derivative metadata where applicable:
  - Derivative label
  - Direct parent Vyral/version
  - Original Root Vyral/version
  - Creator of this derivative
  - Change summary/version history
- Seller confirms they have the rights needed to upload and offer the included materials.

## Purchase flow

1. Browse and preview a listing.
2. Open detail and inspect the exact license offers and derivative/root information.
3. Select an offer and review its full terms.
4. Confirm price, current balance, seller, and selected license.
5. Server validates listing availability, buyer balance, seller, source version, and selected license snapshot.
6. Atomic transaction debits buyer Credits, records seller proceeds and platform fee, and creates a purchase entitlement.
7. Buyer sees the Vyral in My Purchases / their Vyral Library with the exact license and source version.
8. Receipt and immutable transaction/license snapshot are retained.

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

## Initial UI prototype scope

- Marketplace entry in Workspace navigation.
- Explore grid with sample Vyrals, category chips, search, price, creator, and license summary.
- Detail preview with full selected-license terms and Buy action.
- Tabs for Explore, My Listings, My Purchases, My Derivatives, and Sales.
- Derivative listings visibly show modified status and Root/lineage navigation.
- Demo-only interactions may update local UI state; no real charges, listings, purchase entitlements, escrow, or seller settlement are performed by this prototype.

## Later implementation phases

1. Finalize Vyral content model and creator workspace.
2. Build license offer and listing schema, seller controls, and moderation.
3. Build immutable purchase-time license snapshots.
4. Build Clone/Fork/Branch and Root/lineage storage.
5. Integrate Credit ledger and atomic purchase endpoint.
6. Integrate purchase entitlements with Vyral Library and AI generation.
7. Build derivative listing and Root/lineage disclosure in Marketplace.
8. Build seller earnings, platform fee, receipts, refund/dispute handling.
9. Security, abuse prevention, legal/license review, tests, and launch gates.

## Open decisions for later discussion

- Whether Basic preview/download access exposes original files or only in-app use and generation.
- Whether Modification and Modification + Resale are always separate offers or may be custom-configured.
- How the platform identifies and handles a listing that is effectively an unchanged copy rather than a meaningful derivative.
- How downstream license options inherit and disclose source-material restrictions.
- Exact platform fee, minimum/maximum prices, refund rules, and review requirements.
- Whether seller earnings remain spendable Credits only or cash-out is introduced later.
