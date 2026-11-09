# My Storyboard

**Status:** Product concept and planning document  
**Branch:** `feature/my-storyboard`  
**Scope:** Product structure and editor responsibilities; implementation details remain open for future design.

## 1. Overview

My Storyboard is VYRA's workspace for producing longer videos made up of multiple scenes.

A creator starts a Storyboard, creates multiple Scenes inside it, edits each Scene independently, and then assembles the complete production in the Storyboard Master Editor.

The product has two distinct editing levels:

1. **Individual Scene Editor** — edits the content and timeline of one Scene.
2. **Storyboard Master Editor** — arranges and edits all Scenes together as one complete production.

The intended high-level flow is:

`My Storyboard → Multiple Scenes → Individual Scene Editors → Storyboard Master Editor → Final Video`

## 2. Keep AI Chat Generation Separate

AI Chat generation and My Storyboard are separate workflows.

- AI Chat can generate a standalone video, image, or audio item.
- Media generated through AI Chat is saved to **My Media Library**.
- Saving an item in My Media Library does not automatically associate it with a Vyral or a Storyboard.
- A creator may independently create a Vyral and add selected Assets to it.
- A creator may also choose media from the library for use in a Storyboard or Scene when that workflow is designed.

**Important distinction:** My Media Library is a place to keep generated media. A Vyral is a creator-defined collection of Assets. A Storyboard is a multi-scene video-production workspace. These concepts must not be treated as interchangeable.

## 3. Storyboard Structure

A Storyboard contains multiple Scenes.

Each Scene is an independently editable part of the larger video. Scenes should be individually identifiable and manageable within the parent Storyboard.

A Storyboard should provide a way to:

- Create and manage multiple Scenes.
- Open a selected Scene in its own editor.
- Return to the parent Storyboard and continue working on the full production.
- Open the Storyboard Master Editor to arrange the complete sequence.

## 4. Individual Scene Editor

Each Scene opens in its own dedicated video editor.

The Scene Editor is responsible for editing the selected Scene without requiring the creator to work on the entire Storyboard at once.

A Scene may contain multiple media elements and editing layers. The intended capability area includes:

- Video clips and images.
- Audio, voice, and music.
- A Scene-level timeline.
- Editing and arrangement of the Scene's media.
- AI-assisted generation as part of the Scene workflow.
- Other scene-specific editing controls as the product design develops.

These are capability areas for future product design, not a claim that every listed tool has already been implemented or finalized.

### Scene-level independence

- Each Scene has its own content and editing context.
- Editing one Scene should not unintentionally overwrite another Scene.
- Scene-level audio, text, and other elements belong to that Scene unless deliberately promoted or recreated as shared Storyboard elements.

## 5. Storyboard Master Editor

The Storyboard itself must also have its own editor: the **Storyboard Master Editor**.

This is the editing workspace for the complete production. It is not a replacement for the Individual Scene Editors. It works at the Storyboard level and allows the creator to coordinate all Scenes together.

The Master Editor must support these core responsibilities:

### 5.1 Arrange Scenes

- Show all Scenes belonging to the Storyboard.
- Allow the creator to arrange their order.
- Make the overall sequence understandable and editable.

### 5.2 Add transitions between Scenes

- Allow transition effects to be added between Scenes.
- Make it clear which transition belongs to which Scene boundary.
- Keep transition editing at the Storyboard level.

### 5.3 Add shared audio

- Allow common or global audio to be applied across the Storyboard.
- Keep shared audio separate from each Scene's own audio.
- Avoid overwriting the original audio or voice content inside individual Scenes.

### 5.4 Add shared text and subtitles

- Allow common titles, text, or subtitles to be added at the Storyboard level.
- Keep these shared elements separate from Scene-level text and subtitles.
- Support elements intended to span one or more Scenes.

### 5.5 Add other shared elements

The Master Editor may support additional elements that apply across multiple Scenes or to the complete production. Their exact types and controls will be defined in later design work.

### 5.6 Move between the two editor levels

The creator should be able to select a Scene from the Master Editor and open that Scene in its Individual Scene Editor.

After the Scene is edited, the Storyboard-level view should reflect the updated Scene output. The Master Editor remains the place to coordinate the complete production.

## 6. Conceptual Master Timeline

The following is a proposed way to organize the Master Editor timeline. It is a planning model, not a finalized UI specification.

| Track / layer | Responsibility |
|---|---|
| Scenes | The ordered Scene sequence |
| Transitions | Effects between adjacent Scenes |
| Global Audio | Shared music or audio across the Storyboard |
| Global Voice / Sound | Shared voice or sound elements, if needed |
| Global Text | Storyboard-wide titles, text, or subtitles |

Scene-specific tracks remain inside each Individual Scene Editor. Storyboard-wide layers belong in the Master Editor.

## 7. Final Preview and Export

The Master Editor is the natural place to review the assembled production as one complete video.

A proposed finalization flow is:

1. Arrange the Scenes.
2. Configure transitions and shared elements.
3. Preview the complete Storyboard.
4. Resolve any detected production issues.
5. Export the final video.

Potential validation checks before export include Scene readiness, transition continuity, audio synchronization, subtitle timing, estimated export size, and estimated generation or processing cost. The exact checks and export options remain to be specified.

## 8. Product Boundaries and Principles

The following boundaries are important:

- **AI Chat is not Storyboard.** Standalone AI Chat generations go to My Media Library.
- **My Media Library is not a Vyral.** Library storage does not automatically create a Vyral relationship.
- **A Storyboard is not one Scene.** It is the parent workspace for a multi-scene production.
- **A Scene Editor is not the Master Editor.** Each has a separate responsibility and editing context.
- **Scene-level content and Storyboard-wide elements remain distinct.** Shared elements must not silently replace original Scene content.
- **The Master Editor coordinates the complete video.** It arranges Scenes and manages transitions and shared elements.

## 9. Open Design Work

The following details are intentionally left open for future discussion before implementation:

- Storyboard creation, naming, duplication, and deletion behavior.
- Scene creation, duplication, deletion, and reordering interactions.
- Exact Scene Editor tools and timeline capabilities.
- Exact Master Editor layout and timeline interaction model.
- Supported transition types and their configuration.
- Global audio and text behavior, including timing and scope.
- Preview, rendering, export formats, and quality settings.
- Asset selection and reuse from My Media Library and Vyrals.
- Cost estimation and credit handling across generation, rendering, and export.
- Saving, version history, recovery, and collaboration behavior.

## 10. Implementation Status

This document records the agreed product direction and a set of proposed design areas. It does not mean that My Storyboard, either editor, timeline behavior, rendering, or export has been implemented.

Implementation should begin only after the relevant workflows and detailed requirements have been discussed and approved.
