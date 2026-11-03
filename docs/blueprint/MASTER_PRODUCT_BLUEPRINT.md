# VYRA — Master Product Blueprint

> **Document status: DRAFT / DISCOVERY IN PROGRESS**  
> **Product approval: Not yet complete**  
> **Implementation authority: This document becomes authoritative only for sections explicitly marked Approved.**

## 1. Purpose

This document will become the shared product agreement for VYRA. It describes what customers should experience and what the product must do, while leaving implementation details to the technical design unless a technical choice changes the customer experience, cost, privacy, safety or business model.

The goal is to agree on the product before continuing feature development. This avoids building pages, controls or workflows that the Product Owner did not want.

## 2. Collaboration agreement

### Product Owner
The user is the Product Owner and supplies goals, preferences, ideas, constraints and final product decisions.

### Product Architect / Engineering Assistant
The assistant may independently research, propose product improvements, design the technical solution and make implementation-level decisions. It must explain meaningful product-impacting recommendations in plain language and must not silently convert its own proposals into approved requirements.

### Working sequence

1. Listen to the Product Owner's idea or requirement.
2. Clarify only what is necessary; ask one useful question at a time.
3. Add relevant professional recommendations, including alternatives and trade-offs.
4. Discuss the options in plain language.
5. Record the outcome and its status in the Decision Log.
6. Update the relevant blueprint section.
7. Treat only explicitly approved requirements as committed scope.
8. Begin implementation only when the relevant product scope is approved.

The Product Owner does not need to direct coding, frameworks, database design or other technical implementation details. The assistant owns those technical decisions, while remaining accountable for explaining decisions that materially affect the product.

## 3. Project work boundary

Until this blueprint is complete and approved:

- Work on this blueprint in the dedicated branch `docs/master-product-blueprint`.
- Do not merge blueprint work into `main` without explicit authorization.
- Do not change production code, production data, customer-facing behavior, billing, credits, integrations or deployment configuration as part of blueprint discovery.
- Existing code and documents may be inspected to understand the current state.
- Record implementation gaps and risks; do not silently fix them in this blueprint branch.
- When the user says **“VYRA ကိုဆက်လုပ်”** during this phase, continue the blueprint process—not unrelated feature implementation—until the blueprint is approved.

## 4. Product definition

### 4.1 Existing documented direction — review required

The repository's existing product documents describe VYRA as an AI-powered creative studio / video creation SaaS intended to help people turn ideas into finished visual content. The documented direction is **Chat-First, Not Chat-Only**: customers can use conversational assistance and a direct visual workspace.

This is a useful starting point, not a substitute for reviewing the current product with the Product Owner. Existing long-term capability lists must not be interpreted as promises that every capability is required in the first release or is already production-ready.

**Status:** Existing repository direction; Product Owner review pending.

### 4.2 Product Owner's confirmed direction so far

The Product Owner has explicitly stated:

- The app should be simple and easy to understand.
- Pages and buttons should not overwhelm or frighten customers.
- The customer experience should be as simple as practical.
- The Product Owner will explain desired outcomes and ideas step by step.
- The assistant may use its technical judgment and proactively suggest improvements.
- The Product Owner wants to understand recommendations and contribute personal ideas before decisions are finalized.

**Status:** Confirmed principles. Detailed requirements remain to be discovered.

### 4.3 Product vision

VYRA is intended to be an AI Creative Economy Platform where people can create videos and other creative outputs, maintain consistency across scenes and projects, use AI through conversational workspaces, and publish content to social platforms.

A central product concept is **Vyral**, an **AI Creative Asset Package**. A Vyral can contain one or many reusable creative Assets, and creators should be able to share, sell or license their Vyrals under defined permissions. Vyrals can evolve through derivative Versions while retaining traceable lineage to their original source.

Each Vyral should have a dedicated AI Chat Workspace through which its owner or an authorized user can ask the AI to use, adapt and create with the Assets and consistency rules inside that Vyral.

VYRA's intended business model includes credit-based AI usage and a credit-based marketplace for Vyrals and eligible derivative Versions. The Product Owner's explicit commercial goal is to generate revenue through this ecosystem.

**Status:** Product Owner-approved vision concepts. Detailed customer journeys, licensing rules, marketplace policies, pricing and release scope remain open.


### 4.4 Target customers and their needs

_To be discussed and approved._

### 4.5 Main customer problems VYRA solves

_To be discussed and approved._

### 4.6 Product boundaries: what VYRA is and is not

_To be discussed and approved._

## 5. Product scope and release boundaries

| Scope area | Definition | Status |
|---|---|---|
| Core product outcome | To be agreed | Discussing |
| First customer release (MVP) | To be agreed | Discussing |
| Required capabilities | To be agreed | Discussing |
| Optional capabilities | To be agreed | Discussing |
| Explicitly excluded capabilities | To be agreed | Discussing |
| Later / future capabilities | To be agreed | Discussing |

No proposed page or feature is automatically included in the MVP.

## 6. Users, roles and permissions

Define each user type, what they can see, what they can do, and which actions require confirmation.

_To be discovered and approved._

## 7. Information architecture — pages and navigation

This section will define:

- Main navigation.
- Pages and nested workspaces.
- What belongs together and what should remain separate.
- How customers find important actions.
- Which pages are essential, optional, contextual or admin-only.
- Mobile and desktop navigation behavior.

### Initial page-count discussion

A five-item main navigation was suggested as an initial simplification idea in conversation. It is **only a proposal**, not a final page count or approved structure. The final structure must follow the Product Owner's requirements and the actual customer workflows.

**Status:** Proposed / not approved.

## 8. Page specifications

Every approved page will use a consistent specification:

| Field | What to document |
|---|---|
| Page ID and name | Stable identifier and customer-facing label |
| Purpose | Why the page exists |
| Target user | Who uses it |
| Entry points | How the customer reaches it |
| Main content | What the customer sees |
| Primary action | The main thing the customer should do |
| Secondary actions | Other necessary actions |
| Hidden / advanced controls | Details shown only when needed |
| Empty state | What a new customer sees |
| Loading state | How progress is communicated |
| Error and recovery | What happens when something fails |
| Permissions | Who can access or change it |
| Mobile behavior | How it works on a small screen |
| Acceptance criteria | How we know it works correctly |
| Status | Proposed, Discussing, Approved, Rejected, Deferred or Implemented |

No page is approved merely because it exists in the current application.

## 9. Feature and interaction specifications

For every approved feature, document:

- Feature ID and name.
- Customer problem it solves.
- Where it appears.
- Inputs and outputs.
- Expected behavior and workflow.
- Required permissions.
- Cost or credit impact, if any.
- Confirmation requirements.
- Failure cases and recovery.
- Dependencies and limitations.
- Acceptance criteria.
- Decision status.

Buttons must be documented by the action they perform, not just by their labels. Avoid adding controls that do not serve a clear customer need.

## 10. Customer journeys and workflows

Map the real customer journey from entry to successful outcome. Each workflow must show:

- Starting point and prerequisites.
- Customer choices and AI assistance.
- Review and approval points.
- Actions that consume credits or money.
- Progress, waiting and failure states.
- Recovery without losing completed work.
- Final outcome.

Creative approval, paid-generation approval and final publishing approval must be treated as distinct decisions wherever applicable.

## 11. UI/UX principles

Confirmed principle: **simple, approachable and not intimidating**.

Detailed design rules remain to be agreed. Recommendations to evaluate include progressive disclosure (show advanced controls only when needed), clear primary actions, consistent navigation, plain-language labels, helpful empty states, accessible mobile layouts and visible progress.

These recommendations are not approved design requirements until reviewed.

## 12. Business model and customer trust

The Product Owner's intended model is credit-based:

- Customers use credits for AI capabilities such as image, video, audio and other supported creative actions.
- Customers buy Vyrals and eligible derivative Versions using credits.
- Users may share or trade credits with one another, subject to a future policy and system rules.
- Creators may offer Vyrals and permitted derivative Versions in a marketplace.
- VYRA earns revenue through the credit economy and marketplace activity.

The Product Owner's value proposition is that buyers save the time and expense of building complex, consistent creative assets from scratch. They can start from a reusable Vyral and adapt it for their own work.

**Not yet decided:** credit pricing and bundles, marketplace fees, creator payouts, refunds, credit transfers, resale revenue sharing, taxes, fraud prevention and regional/legal requirements. No fee percentage or payout promise is approved.

Existing credit and usage documents are technical/business references to review. Their current rules must be reconciled with the intended customer experience before being treated as final.

## 13. Technical architecture

The assistant will propose and maintain the technical architecture after understanding the approved product requirements. This includes frontend, backend, data model, integrations, AI providers, security, privacy, reliability, observability and deployment.

Technical implementation choices may be made autonomously when they do not contradict approved product requirements or create material product, cost, privacy or security consequences.

## 14. Quality, testing and acceptance

Define measurable release criteria for:

- Core customer journeys.
- Page and interaction behavior.
- Mobile and desktop usability.
- Accessibility and understandable error messages.
- Authentication and authorization.
- Data integrity and recovery.
- AI output and provider failure handling.
- Credit, payment and cost correctness.
- Security and privacy.
- Production readiness.

A feature is not considered complete merely because its UI exists.

## 15. Delivery roadmap

The roadmap will be created only after the product scope and dependencies are understood. Each milestone must have a clear outcome, scope, dependencies, test plan and acceptance criteria.

## 16. Decision status vocabulary

| Status | Meaning |
|---|---|
| Proposed | Suggested by the assistant or Product Owner; not agreed yet |
| Discussing | Being clarified or compared |
| Approved | Explicitly agreed by the Product Owner |
| Rejected | Considered and intentionally excluded |
| Deferred | Valid idea, intentionally postponed |
| Implemented | Built and verified against acceptance criteria |

**Approved** and **Implemented** are different. An approved requirement may not yet be built. An implementation must not be called complete until verified.

## 17. Change control

When an approved requirement changes:

1. Keep the previous decision in the history.
2. Record the reason for the change.
3. Identify affected pages, workflows, data, integrations, tests and costs.
4. Discuss material trade-offs with the Product Owner.
5. Record the new decision and approval.
6. Update the relevant specification and change history.
7. Plan implementation separately.

Do not silently overwrite an earlier decision or change production behavior during blueprint discovery.

## 18. Open items

The [Question Backlog](./QUESTION_BACKLOG.md) tracks the next topics to discuss. Work through them in a sensible order, one conversation at a time. Do not turn the backlog into a long questionnaire for the Product Owner.

## 19. Approval checklist

The Master Blueprint is ready for implementation planning only when:

- [ ] Product vision and target customers are agreed.
- [ ] Core customer outcomes and product boundaries are agreed.
- [ ] MVP scope and exclusions are agreed.
- [ ] User roles and permissions are agreed.
- [ ] Main navigation and page structure are agreed.
- [ ] Required page specifications are complete.
- [ ] Core feature and interaction specifications are complete.
- [ ] Critical customer workflows are agreed.
- [ ] Simplicity and UI/UX requirements are agreed.
- [ ] Business, credit and payment behavior is agreed.
- [ ] Technical architecture is aligned with the approved requirements.
- [ ] Testing and acceptance criteria are defined.
- [ ] Release roadmap is agreed.

**Overall status: DISCOVERY IN PROGRESS — DO NOT TREAT THIS DRAFT AS APPROVAL TO BUILD.**


## 20. Vyral — AI Creative Asset Package

### 20.1 Definition

**Vyral** is the product term for an **AI Creative Asset Package**. The individual items contained inside a Vyral are called **Assets**.

A Vyral is flexible: it may contain a single Asset or many Assets, and there is no fixed limit to the kinds of creative materials it may contain. The creator must be able to understand what Asset types are available and clearly see which Assets are currently included in their Vyral.

Potential Asset types include, but are not limited to:

- Characters and character references.
- Locations, environments and worlds.
- Objects, props and products.
- 2D and 3D models, materials and textures.
- Movements, animation and performance.
- Voices, music, sound effects and other audio.
- Art styles, visual identity, camera and lighting setups.
- Stories, relationships, world rules, prompts and consistency instructions.
- Reusable templates and other creative production resources.

**Status:** The flexible package concept, the term Vyral, and the term Assets are approved. The examples are an open-ended catalogue, not a restrictive list or a promise that every type is supported in the first release.

### 20.2 Reuse across projects

A Vyral is not limited to one video or one project. Users should be able to reuse an authorized Vyral and its Assets across multiple videos, series and future projects, subject to its license and permissions.

**Status:** Approved concept. Exact reuse controls remain open.

### 20.3 Vyral AI Chat Workspace

Each Vyral should have its own dedicated AI Chat Workspace. Users interact with the AI through this chat to ask it to use, organize, adapt or create with the Vyral's Assets.

The dedicated chat must understand the selected Vyral's available Assets, consistency requirements and applicable permissions. It is a Vyral-specific workspace, not merely a generic chat with no knowledge of the package.

**Status:** Approved product concept. Detailed chat capabilities, tool permissions, model routing, UI and credit disclosure remain open.

## 21. Vyral Versions and Lineage

### 21.1 Original and derivative Versions

The original Vyral is the source/root. An authorized buyer or user may use it and may create modified copies, Clones or new Versions where the original creator's permissions allow it.

A derivative Version may substantially transform the source—for example, adapting a cartoon-style Fruit Universe into a realistic 3D interpretation—and may be offered for resale only when the applicable permissions allow resale.

**Status:** Approved concept. The precise permission model and legal terms remain to be designed.

### 21.2 Root, trunk and branches

Vyral evolution should behave like a growing tree:

- **Root:** the original Vyral.
- **Trunk / major branches:** important Versions derived from earlier Versions.
- **Branches:** user-created derivatives.
- **Further growth:** additional derivatives created from any eligible branch.

No matter how many generations are created, users with appropriate access should be able to trace a Version back through its parent Versions to the original Root and inspect the lineage.

The lineage must preserve the relationship between the original Vyral and every intermediate branch. It must not silently flatten or erase the source history.

**Status:** Approved product concept. Exact graph display, access rights, attribution and technical implementation remain open.

### 21.3 Licensing and derivative-use rules

The original creator's permissions and the platform's separate Vyral licensing rules govern what can happen to a Vyral and its descendants. Permissions may include use, modification, cloning, creating derivative Versions and resale. A downstream Version must continue to respect applicable restrictions inherited from its source lineage.

The Product Owner expects a dedicated set of rules and legal terms for derivative Versions and resale. This blueprint records the need for that system but does not yet define legally binding license wording.

**Status:** Approved need for a dedicated rules/legal framework; individual license options and inheritance details remain open.

## 22. Credit Marketplace and Monetization

VYRA is intended to support credit-based transactions for AI usage and the Vyral ecosystem. The marketplace may include original Vyrals and derivative Versions when their permissions allow them to be listed.

The Product Owner's commercial goal is to earn revenue through this system while giving buyers value: a buyer can save the substantial time and expense of creating a consistent creative package from scratch, then adapt it for their own projects within the license.

The following need separate decisions before implementation:

- Credit purchase bundles and value/discount structure.
- AI action pricing and cost visibility.
- Marketplace listing and purchase flow.
- Platform fees and creator earnings.
- Credit transfers between users.
- Revenue sharing for derivative Version sales.
- Refunds, disputes, fraud and chargeback handling.
- Tax, copyright, licensing and consumer-law compliance.

**Status:** Credit-based economy and marketplace direction approved; all detailed commercial rules remain open.


## 23. End-to-End Creative Production and Social Publishing

### 23.1 Core customer outcome

VYRA should provide a broad, integrated creative service: customers can bring an idea for the kind of video they want to make, use VYRA's supported creative capabilities to produce it, and continue through review, export and direct social-platform publishing from the same platform.

The intended experience covers a wide range of video formats, rather than limiting VYRA to one genre or one short-form template. Examples include animation and cartoons, cinematic and story-based videos, talking characters and dialogue, advertisements, educational explainers, documentaries, music videos, short-form social videos and long-form content. This is an open-ended product ambition, not a claim that every format or generation technique is already supported.

The integrated production journey may include idea development, scripts, characters and reusable Assets, images, scenes and storyboards, voice and audio, video generation, editing, review, export and publishing. The exact supported capabilities, quality levels, provider dependencies and release phases must be specified and verified separately.

### 23.2 Social publishing as part of the service

The customer should be able to take a completed and reviewed video from VYRA and publish it directly to supported social platforms without having to manually rebuild the workflow elsewhere, subject to each platform's API, account permissions, content policies and technical limitations.

Publishing must preserve the customer's control: creative approval, any paid-generation approval and final publishing approval are separate decisions. VYRA must clearly show which platforms and publishing actions are actually available and must not promise unsupported integrations or automatic publishing where platform rules do not permit it.

### 23.3 Customer economic benefit and growth

VYRA should create value beyond producing a single video. Through the Vyral ecosystem, customers should be able to use and adapt reusable creative packages, and creators should have opportunities to earn from Vyrals and eligible derivative Versions under the applicable permissions and marketplace rules.

The intended customer benefit is the opportunity to build reusable creative resources and gradually grow a creative business, while also saving the time and expense of building every consistent Asset package from scratch. This is a product goal, not a guarantee of customer income.

**Status:** The broad end-to-end creative-service direction, wide range of intended video use cases, direct publishing goal, and Vyral-enabled customer growth opportunity are confirmed product direction. Exact first-release scope, supported formats, provider capabilities, platform integrations, customer journey and publishing controls remain to be discovered and approved.
