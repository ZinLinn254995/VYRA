# VYRA Blueprint — Decision Log

This log records proposals and decisions without erasing their history. The status must reflect what was actually agreed in conversation.

## Status vocabulary

- **Proposed** — suggested, not agreed.
- **Discussing** — being clarified.
- **Approved** — explicitly agreed by the Product Owner.
- **Rejected** — considered and intentionally excluded.
- **Deferred** — postponed.
- **Implemented** — built and verified (not merely coded).

## Decisions

### BP-001 — Use a dedicated branch for blueprint work

- **Status:** Approved
- **Decision:** Create and use `docs/master-product-blueprint` as a separate branch for the VYRA blueprint.
- **Reason:** Keep product discovery and documentation separate from ongoing application development and protect the current Main branch.
- **Scope:** Blueprint documents only until the blueprint is approved.
- **Approval source:** Product Owner explicitly requested a dedicated branch.

### BP-002 — Continue blueprint work before resuming feature development

- **Status:** Approved
- **Decision:** During this phase, the instruction “VYRA ကိုဆက်လုပ်” means continue the Master Product Blueprint until it is complete and approved.
- **Reason:** Agree on the desired product, pages, functions and workflows before adding more implementation.
- **Approval source:** Product Owner explicitly stated this working rule.

### BP-003 — Keep the customer experience simple

- **Status:** Approved
- **Decision:** VYRA should be simple and approachable. Pages and buttons should not overwhelm or frighten customers.
- **Reason:** Product Owner's stated UX preference.
- **Details still open:** Final page count, navigation, exact page contents, feature placement and workflows.
- **Important:** The five-main-page idea is not approved by this decision.

### BP-004 — Five-item main navigation proposal

- **Status:** Proposed
- **Proposal:** Consider consolidating the current navigation into five main areas.
- **Reason:** Reduce visible complexity for customers.
- **Not decided:** Whether five is the right number, what the areas should be, and which functions belong under each.
- **Next step:** Revisit after understanding the Product Owner's desired customer journey.

## Decision template

For each future decision, record:

- ID:
- Topic:
- User's request or idea:
- Assistant recommendation:
- Options and trade-offs discussed:
- Final decision:
- Status:
- Reason:
- Affected pages / features / workflows:
- Approval source and date:
- Follow-up actions:


### BP-005 — Vyral is an AI Creative Asset Package

- **Status:** Approved
- **Decision:** The product term **Vyral** means **AI Creative Asset Package**. Individual items inside it are called **Assets**. A Vyral may contain one Asset or many Assets, across flexible creative categories.
- **Reason:** The Product Owner wants a reusable package that can hold the materials needed to maintain creative consistency, without imposing an artificial fixed content limit.
- **Scope:** Asset catalogue, package organization and first-release support matrix remain to be designed.
- **Approval source:** Product Owner explicitly approved the Vyral and Assets terminology and confirmed the flexible package concept.

### BP-006 — Each Vyral has a dedicated AI Chat Workspace

- **Status:** Approved
- **Decision:** Each Vyral should have its own dedicated AI Chat Workspace. Users instruct the AI through that workspace, and the AI should work with the selected Vyral's Assets, consistency rules and permissions.
- **Reason:** The Product Owner wants Vyral use and transformation to happen through a dedicated conversational interface.
- **Scope:** Exact tools, UI, model access, credit disclosure and permissions remain open.
- **Approval source:** Product Owner explicitly stated that a separate AI Chat Box is needed for using each Vyral.

### BP-007 — Vyral reuse and derivative Versions

- **Status:** Approved
- **Decision:** Authorized users may reuse an original Vyral and create modified copies, Clones or derivative Versions, including major transformations, when the relevant permissions allow it. Resale is permitted only when authorized.
- **Reason:** Buyers should be able to build on existing creative work and save the time and cost of creating consistency from scratch.
- **Scope:** Detailed license choices, inheritance rules, attribution, resale and revenue sharing remain open.
- **Approval source:** Product Owner explicitly described buyer modification, cloning, versioning and resale subject to the original Vyral's permission and separate rules.

### BP-008 — Preserve Vyral lineage back to the original Root

- **Status:** Approved
- **Decision:** Vyral Versions form a traceable lineage tree. Every derivative should retain a path through its parent Versions back to the original Vyral Root; intermediate branches and the original source must remain traceable.
- **Reason:** Vyral should evolve through users' contributions without losing its original source and branch history.
- **Scope:** Exact lineage visualization, permissions to inspect ancestry, attribution and implementation remain open.
- **Approval source:** Product Owner explicitly compared the original Vyral to a root and described derivative growth as branches that must remain traceable back to the original branches, trunk and root.

### BP-009 — Credit-based AI and Vyral economy

- **Status:** Approved
- **Decision:** VYRA's intended economy uses credits for AI usage and for marketplace transactions involving Vyrals and eligible derivative Versions. Users may share or trade credits under rules to be defined. The Product Owner's goal is to generate revenue through this ecosystem.
- **Reason:** Credit-based usage and trading create the intended commercial model, while reusable Vyrals provide buyers with value by reducing the time and expense of building consistent assets themselves.
- **Scope:** Pricing, bundles, platform fees, creator payouts, transfers, refunds, resale revenue sharing and compliance remain open.
- **Approval source:** Product Owner explicitly stated that Vyral transactions and usage will use credits and that this is the intended revenue model.


### BP-010 — End-to-end video creation, social publishing and customer growth

- **Status:** Approved
- **Decision:** VYRA should aim to provide an integrated service for creating a wide range of video types and taking reviewed, completed videos directly to supported social platforms. The Vyral ecosystem should also give customers opportunities to earn from reusable creative packages and grow their own creative activity or business over time.
- **Reason:** The Product Owner wants customers to receive a complete service rather than a collection of disconnected AI tools, and to gain economic value from the Vyral ecosystem.
- **Scope:** The range of video formats is an open-ended product ambition, not a claim that every format is currently supported. Exact capabilities, first-release scope, supported social platforms, publishing workflow, creator earnings and legal/commercial rules remain open.
- **Approval source:** Product Owner explicitly stated that the service should cover the video types customers want to create, extend through direct social-media publishing, and provide benefits and growth opportunities through Vyral's revenue-generating capabilities.
