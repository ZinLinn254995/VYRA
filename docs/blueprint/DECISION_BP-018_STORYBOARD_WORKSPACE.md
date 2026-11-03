# BP-018 — Storyboard Library and Scene Workspace

**Status: Approved**

## Decision

- In the customer-facing Workspace, a complete video project is called a **Storyboard**. Do not use a separate **Project** label for this work-unit.
- Workspace navigation uses simple, large page buttons and shows recent Storyboards on the Workspace entry view.
- The dedicated **Storyboard** page lists the customer's existing Storyboards.
- Customers can create another one from that page using **Create New Storyboard**.
- Opening a Storyboard shows all Scenes for that video together.
- Scenes can be created manually or through global AI Chat. Both creation paths add Scenes to the same Storyboard and the same Scene collection.

## Reason

The Product Owner wants the complete video work to be represented and navigated as a Storyboard, with a simple library and one unified place for its Scenes.

## Still open

Exact Workspace button set, Storyboard sorting and layout, Scene fields, manual creation controls, editing behavior, and empty/loading/error states remain to be discussed.

## Relationship to earlier decisions

This refines the Project-centric Workspace framing in BP-017. It does not approve the five-area proposal in BP-014. The broader Blueprint remains in discovery and is not approval to begin implementation.
