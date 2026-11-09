# My Storyboard

**Status:** Approved product direction; Master Timeline UI foundation implemented on `feature/my-storyboard` (not merged to Main). Media-backed editing and final rendering remain future work.  
**Branch:** `feature/my-storyboard`  
**Scope:** Product structure, three-level editor responsibilities, and simple-user-experience principles. Detailed implementation behavior remains subject to future design.

## 1. Overview

My Storyboard is VYRA's workspace for producing longer videos made up of multiple scenes.

A creator starts a Storyboard, creates multiple Scenes inside it, edits each Scene independently, edits individual media items within each Scene, and then assembles the complete production in the Storyboard Master Editor.

The product has **three distinct editing levels**:

1. **Storyboard Master Editor** — edits and coordinates the complete Storyboard, including all Scenes and shared elements.
2. **Individual Scene Editor** — edits the content and timeline of one Scene.
3. **Individual Media Editor** — edits one selected media item (such as one video, image, audio, voice recording, or text item) independently.

The intended high-level flow is:

`My Storyboard → Storyboard Master Editor → Individual Scene Editor → Individual Media Editor → back to Scene Editor → back to Master Editor → Final Video`

The hierarchy exists to make the experience simpler, not to expose more technical complexity. Each level has a focused responsibility and should show only the controls relevant to that task.

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

## 4. Level 1 — Storyboard Master Editor

The Storyboard itself has its own editor: the **Storyboard Master Editor**.

This is the editing workspace for the complete production. It coordinates all Scenes together and is not a replacement for the Individual Scene Editors.

### 4.1 Arrange Scenes

- Show all Scenes belonging to the Storyboard.
- Add, move, reorder, duplicate, and remove Scenes.
- Make the overall sequence understandable and easy to change.
- Preview an individual Scene.

### 4.2 Add transitions between Scenes

- Add transition effects between Scenes.
- Make it clear which transition belongs to which Scene boundary.
- Keep transition editing at the Storyboard level.

### 4.3 Add shared audio

- Add common or global music/audio across the Storyboard.
- Keep shared audio separate from each Scene's own audio.
- Avoid overwriting original audio or voice content inside individual Scenes.

### 4.4 Add shared text and subtitles

- Add common titles, text, or subtitles at the Storyboard level.
- Keep shared elements separate from Scene-level text and subtitles.
- Support elements intended to span one or more Scenes.

### 4.5 Add other shared elements

Support additional elements that apply across multiple Scenes or to the complete production as the product design develops.

### 4.6 Preview and export

- Preview the complete Storyboard as one video.
- Export the assembled final video.

Potential validation checks before export include Scene readiness, transition continuity, audio synchronization, subtitle timing, estimated export size, and estimated generation or processing cost. The exact checks and export options remain to be specified.

### 4.7 Move between editor levels

The creator can select a Scene from the Master Editor and open it in its Individual Scene Editor. After editing, the Master Editor should reflect the updated Scene output.

## 5. Level 2 — Individual Scene Editor

Each Scene opens in its own dedicated editor. This workspace is responsible for creating and editing the selected Scene without requiring the creator to work on the entire Storyboard at once.

A Scene may contain multiple media items, such as:

- Video clips.
- Images.
- Audio and music.
- Voice recordings.
- Text and subtitles.
- Other supported media types as VYRA grows.

### 5.1 Scene-level features

The approved capability list for the Scene Editor includes:

- Add media.
- Choose existing items from My Media Library.
- Create new media with AI.
- Move and arrange media items.
- Cut or remove unwanted portions where supported by the media type.
- Duplicate or delete a media item.
- Add text.
- Record or add voice.
- Add music.
- Preview the current Scene.

Each Scene has its own content, editing context, and timeline. Editing one Scene must not unintentionally overwrite another Scene.

Scene-level audio, text, and other elements belong to that Scene unless deliberately created as shared Storyboard elements in the Master Editor.

### 5.2 Open an Individual Media Editor

Selecting a media item in the Scene Editor opens the matching Level 3 editor for that single item. When the creator saves or finishes editing, the updated media result returns to the Scene and is reflected in its timeline.

## 6. Level 3 — Individual Media Editors

Each media item can be opened in its own dedicated editor. The editor is selected according to the media type. It edits the selected item, rather than the entire Scene or Storyboard.

The approved initial editor categories and feature areas are:

### 6.1 Video Editor

- Trim or cut the video.
- Change its duration.
- Adjust playback speed.
- Resize or crop the frame.
- Adjust color, brightness, and contrast.
- Adjust the video's volume.
- Use AI-assisted editing.

### 6.2 Image Editor

- Crop and rotate.
- Resize.
- Adjust color.
- Adjust brightness and contrast.
- Remove the background.
- Use AI-assisted editing.

### 6.3 Audio Editor

- Cut audio.
- Adjust duration.
- Adjust volume.
- Make the beginning or ending fade smoothly.
- Reduce noise.
- Use AI-assisted audio editing.

### 6.4 Voice Editor

- Listen to the recording.
- Remove unwanted words or sections.
- Improve voice clarity.
- Adjust volume.
- Remove silent sections.
- Use AI voice enhancement.

### 6.5 Text Editor

- Write or edit text.
- Change the font.
- Change text color.
- Change text size.
- Set when the text appears.
- Choose a simple animation.

These categories are the approved starting scope. The architecture should allow additional media-specific editors later, such as editors for 3D objects, animation, characters, and other supported Asset types, without forcing those controls into unrelated editors.

## 7. Core UX Principle — Professional Power, Child-Friendly Simplicity

**The three-level editor architecture exists specifically to keep each editor simple and easy to understand.**

The underlying technology may be highly advanced, but the user-facing experience must remain approachable—even for a child or a first-time creator.

The following principles apply to all three levels:

1. **Simple language:** Avoid technical jargon in visible labels and instructions. Prefer familiar action words such as “Cut,” “Move,” “Add,” “Make,” “Listen,” “Preview,” and “Save.”
2. **Only relevant controls:** Show the tools needed for the current task. Do not crowd an editor with unrelated features.
3. **Clear actions:** Make each button's purpose immediately understandable.
4. **Progressive guidance:** Help users understand what to do next without requiring them to learn professional editing terminology.
5. **Hide technical complexity:** Advanced processing and complex implementation should happen behind the scenes wherever possible.
6. **Consistent experience:** Keep navigation, saving, previews, and basic interactions consistent across all editor levels.
7. **Powerful results without a complicated interface:** Simplicity must not mean removing the capability to produce professional-quality work.

The editor levels must not become three layers of increasingly technical interfaces. They are three focused workspaces, each designed to make one kind of task easier.

## 8. Master Timeline — One Shared Timebase

The Storyboard Master Editor uses one shared horizontal timeline and one time ruler for the complete production.

### 8.1 Scene sequence

- Scenes appear as compact items in one horizontal row.
- Transition slots sit between adjacent Scenes. Selecting a slot allows a transition effect and duration to be chosen.
- The Scene row is responsible for sequence and transitions; the existing Scene cards remain the place to open, manage, and select Scenes.
- A Scene's original source duration is immutable from the Master Timeline.
- Each timeline Scene instance stores a separate source In/Out range. For example, a 10-second source Scene can be trimmed to 3–6 seconds, producing a 3-second timeline instance. It cannot be extended beyond its original source duration.
- Changing a timeline trim must never modify the original Scene or its source media.

### 8.2 Audio and Text tracks

- The Master Timeline has independently addable Audio tracks and Text tracks. Creators may add as many as needed.
- Audio tracks can contain multiple positioned clips for music, voice, sound effects, and other audio.
- Text tracks can contain multiple positioned text clips for titles, dialogue, captions, and other text overlays. The track category is **Text**, not a dedicated Subtitle track.
- Audio and Text clips support position and duration adjustment, split at the playhead, duplicate/copy, and delete. Clip-level controls remain contextual.
- All clips use the same timeline timebase as the Scene sequence.

### 8.3 Shared time and navigation

- One playhead and one time ruler coordinate Scenes, Audio, and Text.
- Zoom changes the horizontal scale for the shared timeline.
- The overall timeline duration is derived from the trimmed Scene instances and transition overlaps; Audio and Text clips are positioned against that same duration.
- The initial UI provides horizontal timeline scrolling, zoom controls, playhead positioning, clip selection, and drag-to-reposition for Audio and Text clips.
- Future editing work can extend the controls with waveform rendering, media-backed trim handles, snapping, undo/redo, and playback/render integration without changing the shared timebase.

This Master Timeline is separate from the content timeline inside an Individual Scene Editor.

## 9. Editing and Return Flow

The intended editing flow is:

1. Open the Storyboard Master Editor.
2. Select a Scene and open its Scene Editor.
3. Select an individual media item and open its matching Media Editor.
4. Edit that one item and save the result.
5. Return to the Scene Editor, where the updated item appears in the Scene.
6. Return to the Master Editor, where the updated Scene is reflected in the complete production.
7. Preview and export the final video.

Edits at a lower level should update the corresponding item or Scene in the parent level without silently overwriting unrelated content. The exact versioning, undo, and conflict behavior remains future design work.

## 10. Product Boundaries and Principles

- **AI Chat is not Storyboard.** Standalone AI Chat generations go to My Media Library.
- **My Media Library is not a Vyral.** Library storage does not automatically create a Vyral relationship.
- **A Storyboard is not one Scene.** It is the parent workspace for a multi-scene production.
- **The Master Editor is not the Scene Editor.** They have separate responsibilities and editing contexts.
- **The Scene Editor is not the Individual Media Editor.** The Scene Editor manages the Scene; the Media Editor focuses on one selected media item.
- **Scene-level content and Storyboard-wide elements remain distinct.** Shared elements must not silently replace original Scene content.
- **Each media editor is media-specific.** Video controls belong in the Video Editor, image controls in the Image Editor, and so on.
- **Simple UI is mandatory.** The underlying system may be complex; the user-facing editor should not be.

## 11. Open Design Work

The following details remain for later discussion before implementation:

- Storyboard creation, naming, duplication, and deletion behavior.
- Scene creation, duplication, deletion, and reordering interactions.
- Exact layouts and interaction models for all three editor levels.
- The detailed behavior of each media-specific editing control.
- Supported transition types and their configuration.
- Global audio and text behavior, including timing and scope.
- Preview, rendering, export formats, and quality settings.
- Asset selection and reuse from My Media Library and Vyrals.
- Cost estimation and credit handling across generation, rendering, and export.
- Saving, auto-save, undo/redo, version history, recovery, and collaboration behavior.
- How additional media types receive their own simple, focused editors.

## 12. Implementation Status

This document records the approved product direction for the three-level editor architecture and its simplicity-first UX principle. The Master Timeline UI foundation described in section 8 has now been implemented on the feature branch. This does not mean that media ingestion, real audio/video playback, waveform generation, final rendering, or export is complete.

Further implementation should preserve the approved page header, creation flow, Storyboard details, and existing auto-save behavior.


## 13. AI-First Creation — AI Does the Work, You Make the Decisions

**My Storyboard should be AI-first, with manual editing available when the creator wants or needs it.**

VYRA's Global AI Chat is intended to be the primary way to create and coordinate work across the experience. The creator should be able to describe the desired result in natural language and let AI handle most of the production work.

For My Storyboard, the intended direction is for AI to handle as much of the following as the supported tools and permissions allow:

- Create and organize a Storyboard and its Scenes.
- Plan and arrange the Scene sequence.
- Generate or select suitable video, image, audio, voice, and text content.
- Place and coordinate media within Scenes.
- Suggest or apply transitions and shared music, voice, titles, and subtitles.
- Revise content or scenes in response to the creator's feedback.
- Prepare the complete production for preview and final export.

The creator should mainly review the result, make creative decisions, and request changes through Global VYRA AI Chat. The creator should not have to perform every production step manually.

### 13.1 Manual editing is for necessary adjustments

Editors remain important, but their purpose is to give the creator direct control over details that need human judgment or precise adjustment. Examples include:

- Adjusting the timing or position of an item.
- Trimming a part that does not feel right.
- Changing a volume level.
- Moving or resizing text and images.
- Inspecting an AI-generated result and making a small correction.

These are examples, not a requirement that every user must manually adjust every item. The creator should be able to accept a satisfactory AI result without entering an editor.

### 13.2 Keep the AI-first experience simple

- Prefer a natural-language instruction to a long sequence of manual controls when AI can reliably perform the task.
- Do not force users into an editor for work that Global VYRA AI Chat can complete.
- Keep manual controls focused on the adjustments that genuinely benefit from direct human control.
- Preserve the three editor levels as optional, focused workspaces—not as mandatory steps in every creation workflow.
- Keep the interface simple and uncluttered while allowing advanced capabilities to operate behind the scenes.

**Core principle: “AI Does the Work. You Make the Decisions.”**

This is an approved product direction, not a claim that all listed AI capabilities are already implemented. The exact capabilities, tool permissions, review points, and reliability requirements must be designed and validated before implementation.


## 14. Chat-First Editing and Child-Friendly Controls

**The AI Chat Box is the primary way to create, add, arrange, and edit content at all three editor levels.** The visible editor controls must remain minimal and understandable to a first-time user, including children.

### 14.1 AI Chat is the main control

- Keep the AI Chat Box easy to find and use in the Master Editor, Scene Editor, and Individual Media Editor.
- Creators should be able to ask in ordinary language to add, create, remove, move, shorten, change, improve, or revise content.
- AI should perform the requested work and show the result for the creator to review.
- Do not require users to learn editing terminology, navigate complex menus, or perform long sequences of manual steps when AI can do the work reliably.
- Preserve the creator's intent and approved content; ask for confirmation before destructive or consequential changes when needed.

### 14.2 Only simple, contextual controls

Show only a small number of familiar actions relevant to the current editor and selected content. Examples include:

- **Add** — add a Scene, media item, music, or text where appropriate.
- **Move** — change the order or position of a Scene or item.
- **Cut** — remove an unwanted part when supported.
- **Play / Preview** — watch or listen to the result.
- **Back** — return to the parent editor.
- **Done** — finish the current edit and return to the parent editor.

These are examples of simple actions, not a requirement to display every button at once. Show controls only when they are relevant and available.

### 14.3 Hide professional complexity

- Do not expose crowded professional toolbars, complicated parameter panels, technical jargon, or advanced editing controls by default.
- Keep detailed timing, rendering, synchronization, media processing, and other technical operations behind the scenes or let AI handle them.
- Offer a simple direct adjustment only when it is genuinely useful; advanced capability must not make the interface intimidating.
- Use clear labels, recognizable icons with text where helpful, and predictable interactions across all three editor levels.
- The Master Editor should remain focused on the complete Storyboard; the Scene Editor on one Scene; and the Media Editor on one selected media item.

**The goal is professional-quality creative power with controls simple enough for a child to understand. AI Chat does most of the work; visible buttons are only for the few actions users may want to do directly.**


## 15. Master Editor Content Scope — Preserve Existing Header and Creation Details

The existing Storyboard Editor page header and its compact-header behavior are approved and must remain unchanged while the Master Editor content is developed.

- Preserve the existing Card Header, Back navigation, logo, title, compact styling, scroll behavior, and compact animation exactly as they are.
- Preserve the existing Create Storyboard flow and the Title, Description, and Details area shown immediately after entering a newly created Storyboard.
- Do not redesign, replace, move, or otherwise modify those existing header and creation-detail sections as part of the Master Editor implementation.
- The new Storyboard Master Editor begins **below the existing Title, Description, and Details section**. Only the content beneath that point is in scope for the new implementation.
- Keep the existing creation/confirmation and auto-save behavior intact.

This is a strict implementation boundary: build the Master Editor inside the existing page structure without disturbing the already-approved header, compact behavior, or Storyboard details experience.


## 16. Master Timeline UI Foundation — Implemented

The first Master Timeline UI foundation is now present below the existing Scenes section on `feature/my-storyboard`.

- Compact horizontal Scene sequence with transition insertion slots.
- Per-Scene source In/Out controls stored separately from the original Scene duration.
- Separate Audio and Text track creation, with multiple clips per track.
- Shared timeline ruler, playhead position, zoom controls, and common overall time calculation.
- Audio/Text clip selection, drag-to-reposition, start/duration adjustment, split-at-playhead, duplicate, and delete.
- Timeline data is stored in the Storyboard details and follows the existing Storyboard auto-save/persistence path.

This is an interactive UI/data foundation. It does not yet connect clip blocks to actual media files, render waveforms, provide real-time video/audio playback, or export a finished video. Those capabilities must be added without changing the shared timebase or modifying original Scene source data.



## 17. Video Editing Engine — Elah Evaluation and VYRA Integration Contract

### 17.1 Selected technical candidate

Evaluate `@elah/editor` (Elah) as the video-editing engine for the Storyboard Master Editor and the future media-backed Scene/Media editing workflows.

- License: Apache-2.0; suitable for commercial embedding subject to retaining the applicable license notices.
- Provides a React editor SDK, frame-based timeline engine, WebGL2 preview, media import/library, multiple video tracks, multi-track audio, image/text/shape clips, clip trimming/speed/crop, keyframes, transitions, undo/history, and browser export.
- Its CSS token and component-slot APIs allow VYRA to apply its own Light/Dark/System design tokens. Do not expose the stock Elah branding or default styling as the VYRA product identity.
- The published `@elah/editor` package is currently at 1.0.0. Treat this as a new dependency that requires a VYRA proof-of-concept and regression checks before it replaces any existing editor UI.

### 17.2 Responsibility boundary

Elah is the editing/rendering engine, not VYRA's product data model or media ownership system.

- VYRA remains the source of truth for Storyboards, Scenes, Vyrals, Asset DNA, media ownership, provenance, permissions, and cloud persistence.
- Elah owns the active editing session: frame-accurate clip placement, playback, preview, transforms, timeline interactions, and export rendering.
- VYRA owns the mapping between VYRA Scene/Asset IDs and Elah track/clip IDs. Persist this mapping explicitly; never rely on array order or display names as identity.
- Keep the existing Storyboard header, compact-header behavior, Title/Description/Details sections, Create/Cancel flow, and three-level editor hierarchy unchanged.
- Keep a VYRA Scene sequence/scene-instance concept. Elah clips must not silently replace or mutate the original Scene source records.

### 17.3 Project data and backward compatibility

- Add a versioned Elah project document as a new field within the existing Storyboard master-timeline data. Keep the current `sceneRanges`, `sceneInstances`, `transitions`, `audioTracks`, and `textTracks` fields readable during migration.
- Build a deterministic adapter between VYRA's existing timeline representation (seconds and VYRA IDs) and Elah's integer-frame Project representation. Define one project FPS and use explicit rounding rules at the boundary.
- Preserve stable VYRA IDs in adapter metadata so an edit can be mapped back to the correct Scene, Asset, and media record.
- On load, validate the saved Elah document before replacing the active editor project. Handle unsupported/newer document versions without discarding the existing VYRA timeline data.
- On save, serialize the Elah project and media-library snapshot together with the VYRA mapping metadata. Keep the existing 500 ms Storyboard auto-save path, but debounce high-frequency timeline gestures so drag operations do not issue a cloud write on every pointer move.
- Round-trip tests must prove that load → edit → save → reload preserves Scene order, source In/Out, transitions, audio/text positions, clip settings, IDs, and unknown VYRA metadata.

### 17.4 Media persistence and relinking

- Import media through VYRA's My Media Library / Asset storage flow. Elah's local browser media library is an editing cache, not the canonical VYRA library.
- Persist stable VYRA storage references and relink them into Elah after reload. Do not persist temporary `blob:` or `data:` URLs as the only source of a media clip; those URLs cannot be recovered after the page session ends.
- Store media-library snapshots and project documents together, then relink assets after the media library has hydrated.
- Missing or inaccessible media must remain visible as a recoverable missing-media state. Never silently delete a clip or its timeline position.
- Scene Editor must gain real media selection/import and asset references before the Master Editor can claim to provide real video editing.

### 17.5 VYRA presentation and app integration

- Embed Elah inside a VYRA-owned layout. Use VYRA's existing header and page shell; do not mount a second independent editor provider on the same page.
- Map Elah's `--elah-*` design tokens to VYRA semantic tokens, including canvas/surface, border, text, accent, clip-type colors, playhead, selection, and overlays. Support both Light and Dark themes.
- Use Elah's composable timeline/preview/panel APIs where they fit. Keep VYRA-specific Scene navigation, asset provenance, AI actions, and simplified controls in VYRA-owned components.
- Configure Vite's module worker format and dependency pre-bundling exclusions exactly as required by Elah's installation guide. Do not add the package without also applying its documented worker configuration and regenerating the npm lockfile.
- Only one active Elah EditorProvider may be mounted in the current page because its stores are module-level singletons. The current one-Storyboard-at-a-time page flow is compatible; do not mount independent nested editors for Master, Scene, and Media levels simultaneously.

### 17.6 Browser and export constraints

- Browser editing and export require WebGL2 and WebCodecs; Chromium-based browsers (Chrome/Edge) are the primary supported target. Firefox is partial and Safari support is limited.
- Test export on real mobile devices and desktop browsers. Do not promise universal browser export until verified.
- Long/high-resolution projects can hit browser memory and Blob-size limits. Add export progress, cancellation/recovery, and clear failure handling; evaluate server-side rendering for longer jobs rather than assuming all exports should run in the browser.
- Verify audio/video synchronization, codec availability, font handling, transitions, and output dimensions before enabling final export for customers.

### 17.7 Adoption gates

Do not replace the existing Master Timeline until a separate proof-of-concept passes all of these checks:

1. Vite production build succeeds with Elah's documented worker configuration.
2. Import a real VYRA-stored video, image, and audio item; reload and relink them without losing thumbnails or clip positions.
3. Add multiple video and audio tracks, text overlays, trim, split, move, crop, speed, transitions, undo, and redo.
4. Save, reload, and round-trip the project through the existing Storyboard local/cloud persistence path.
5. Export a real MP4 and compare the exported result with the preview for timing, dimensions, and audio synchronization.
6. Verify VYRA Light/Dark themes, responsive layout, keyboard interactions, and touch gestures.
7. Run the existing Storyboard tests and add adapter, persistence, media-relink, and export regression tests.

Only after these gates pass should Elah become the production editing engine. If a capability is missing from its editing UI, build the required VYRA-owned control on its public engine API rather than silently removing the feature.
