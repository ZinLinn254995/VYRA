# Storyboard Creation and Preview

## Product Owner decision

When a customer creates a Storyboard, keep the setup deliberately simple. The creation form contains only:

- **Name** — required; prefilled with “Untitled Storyboard” and editable.
- **Description** — optional; starts empty.
- **Aspect ratio** — required selection, defaulting to 9:16. Supported choices: 9:16 (Portrait), 16:9 (Landscape), and 1:1 (Square).

Do not require users to choose video type, visual style, resolution, frame rate, duration, language, audio, subtitle, or export format during Storyboard creation. Those decisions can be handled later in the relevant workflow.

A newly created Storyboard is saved immediately as a Draft with an empty Scene list. The chosen aspect ratio belongs to the Storyboard and is the default canvas ratio for its Scenes and sequence preview.

## Storyboard-level Preview

The Storyboard page shows the preview inline, directly below the Name and Description fields and the relevant Storyboard settings. There is no separate Preview button, dialog, or page. The Scenes list appears immediately below this inline preview. The inline preview:

- Presents the Scenes in their current order.
- Plays through the available scene visual previews using each Scene's duration as the default display time.
- Supports Play/Pause and Previous/Next scene controls inline.
- Shows the current Scene number, duration, narration/description, and total Storyboard duration.
- Uses the Storyboard's aspect ratio for the preview canvas.
- Updates automatically when Scene order, duration, or available preview media changes.

This is a Storyboard/animatic preview for reviewing the planned sequence. It must not be presented as a final rendered MP4 or imply that missing media has already been generated. Final video assembly/export remains a separate production step.

## UX principles

- Keep the creation form short and approachable on mobile and desktop.
- Allow the customer to edit the Storyboard name, description, and aspect ratio later.
- A blank Storyboard is valid; it does not need AI-generated content or Scenes to exist.
- Place the inline preview directly above the vertically ordered Scene list; do not make users open a separate preview surface.
- Keep Scene creation, ordering, and preview visible without introducing a complex nonlinear video editor.
- Preserve existing generation, media storage, audio/video export, publishing, billing, and other backend capabilities.
