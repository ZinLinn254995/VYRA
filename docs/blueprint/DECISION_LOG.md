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


### BP-011 — Full-screen Chat Mode and Workspace Mode with swipe transition

- **Status:** Approved
- **Decision:** VYRA should provide Chat Mode and Workspace Mode as two full-screen views of the same product and shared project data. Customers should be able to switch between them using a swipe interaction.
- **Reason:** The Product Owner wants ChatGPT-like simplicity for conversation and a separate visual creative-studio space without forcing both into a crowded split-screen layout.
- **Scope:** Exact gesture behavior, navigation details and visual design remain open.
- **Approval source:** Product Owner explicitly accepted the full-screen two-mode concept and swipe-based switching.

### BP-012 — Global, persistent and page-aware AI Chat

- **Status:** Approved
- **Decision:** AI Chat should be available throughout VYRA, including Workspace and Vyral browsing. The conversation persists across page changes. The AI should understand the active page, selected project/scene/item, relevant settings and live app data; the active page is its primary context, while it may access other relevant pages or projects when needed and authorized. AI actions and manual edits must update the same shared data.
- **Reason:** The Product Owner wants one continuous AI assistant that understands the current work and can help across the application, without splitting chat state from visual Workspace state.
- **Scope:** Context boundaries, action permissions, audit history, undo/recovery and detailed UI remain open.
- **Approval source:** Product Owner explicitly described global chat, persistent context, page awareness, cross-page actions and shared live data.

### BP-013 — Human-Controlled Area

- **Status:** Approved
- **Decision:** VYRA should have a distinct Human-Controlled Area for controls and decisions that only the human customer may directly control.
- **Reason:** Preserve human authority over important account and platform decisions rather than allowing AI to control everything.
- **Scope:** The exact controls included and whether AI is completely excluded or may view/explain without modifying anything remain open. The general action-confirmation model for reversible changes, paid generation, publishing, financial, security and destructive actions also remains open.
- **Approval source:** Product Owner explicitly stated that a dedicated area should exist for things only a human can control.

### BP-014 — Workspace structure proposal

- **Status:** Proposed
- **Proposal:** Organize Workspace into five possible areas: Project Workspace; Storyboard & Scene Editor; Vyral Workspace; Media & Production; Review & Publishing.
- **Reason:** Provide a simple way to organize the major creative work areas.
- **Not decided:** Whether these are separate pages, tabs, contextual panels or another structure; whether five areas are sufficient; and whether Workspace opens directly into one project or a project overview.
- **Approval source:** Assistant proposal only; Product Owner has not approved the structure.

### BP-015 — Creative plan approval before storyboard and paid generation

- **Status:** Approved
- **Decision:** For a new video, AI should help develop ideas and prepare an overall rough creative plan. The customer reviews and approves that plan before VYRA automatically creates a scene-by-scene rough Storyboard. The initial Storyboard contains descriptions/placeholders, not generated media. Actual paid media generation must wait for a separate explicit approval.
- **Reason:** Let customers validate the creative direction before generation costs are incurred, while giving them an editable scene plan.
- **Scope:** Exact plan format, storyboard structure, scene fields and generation controls remain open.
- **Approval source:** Product Owner explicitly described this sequence and the distinction that no real image/video/audio is generated during initial storyboard planning.

### BP-016 — Minimalist futuristic Creative Studio Workspace

- **Status:** Approved
- **Decision:** Workspace should be clean, minimal, uncluttered and functional, with a futuristic, premium, professional AI Creative Studio aesthetic. Product sophistication should be delivered through capable behind-the-scenes automation and orchestration, not by exposing unnecessary complexity in the UI.
- **Reason:** The Product Owner wants a simple customer experience supported by sophisticated internal systems.
- **Scope:** Exact colors, layout, typography, navigation and responsive details remain open.
- **Approval source:** Product Owner explicitly clarified the simplicity and behind-the-scenes sophistication principles and accepted the futuristic professional creative-studio direction.


### BP-017 — Workspace first view: Project Creative Studio

- **Status:** Approved
- **Decision:** The first view shown when entering Workspace should be **Project Creative Studio**, with the current/active project as the main focus. It should provide quick access to Storyboard, Vyral, Media and Settings, and show the production journey as Plan → Storyboard → Generate → Review → Publish. Global AI Chat remains available throughout Workspace.
- **Reason:** The Product Owner confirmed that the proposed Project Creative Studio first-view UI matches the desired experience and explicitly requested that this UI be used.
- **Scope:** This approves the first-view concept and information hierarchy, not exact visual styling, spacing, responsive behavior, project switching, the no-active-project empty state, or the proposed five-area Workspace structure in BP-014.
- **Approval source:** Product Owner explicitly said the proposed UI is exactly what they want and asked to record it.
