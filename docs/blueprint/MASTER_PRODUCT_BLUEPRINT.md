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

_To be discussed and approved._

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

Define customer plans, pricing, credits, payments, refunds, usage visibility, cost transparency and support expectations.

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
