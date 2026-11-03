# BP-019 — Storyboard Visual Sequence and Item Workspaces

**Status:** Approved  
**Date:** 2026-11-04  
**Branch:** `docs/master-product-blueprint`  
**Scope:** Product behavior and information architecture only. This decision does not authorize implementation or merging into `main`.

## Decision

### 1. Storyboard is an ordered visual composition

A Storyboard presents its creative items in sequence, according to their Position. Items are shown in a form appropriate to their type:

- Video items appear as video previews.
- Image items appear as image previews.
- Idea items appear as idea/content representations.

The Storyboard is not limited to a plain list of Scene names. It is a visual overview of the ordered content.

### 2. Users control the sequence

Users can arrange and reorder Storyboard items as they wish. Their Position determines the sequence in which the items are presented in the Storyboard.

### 3. Each item opens its own workspace

Selecting an individual Scene/item opens its corresponding workspace. The user can manage that item in detail from within its workspace. The Storyboard remains the overview and sequencing surface; detailed creation and editing happen inside the selected item's workspace.

### 4. Scene entry paths

A Scene may be entered through three paths:

1. Create a new Scene manually.
2. Open and edit an existing Scene.
3. Open a rough Scene/idea created through AI Chat.

These paths lead into the Scene workspace, retaining the relevant Scene context and prior AI discussion where applicable.

### 5. Scene workspace supports multiple creation resources

The Scene workspace is the place to create and manage the video associated with that Scene. Video creation is not restricted to one method. It can use:

- Vyral Consistency Libraries and their applicable Assets.
- User-written or AI-assisted Prompts.
- Existing items from the Media Library.
- AI Chat to discuss, plan, create, and refine the Scene.

These resources may be combined in one creation workflow rather than requiring the user to choose only one source.

## Responsibilities

- **Storyboard:** visual overview, ordered presentation, and user-controlled positioning of its creative items.
- **Scene workspace:** detailed creation and management of the selected Scene and its associated video.

## Boundaries and open details

This decision does not define the final visual design, exact item data model, supported media types beyond the examples above, drag-and-drop interaction details, generation settings, provider/model availability, credit costs, or implementation architecture. Those remain for later discussion and approval.

This decision extends the approved Storyboard/Scene direction in BP-018. It does not authorize implementation, a pull request, merging into `main`, or production changes.
