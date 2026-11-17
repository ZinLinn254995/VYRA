# VYRA UI/UX Foundation

## Purpose

This document defines the shared UI foundation for the VYRA customer platform. It is intended to keep public, authentication, workspace, creative-studio, administration, and owner experiences coherent as the product grows.

## Compatibility principle

The existing Main interface is the compatibility baseline. The foundation is introduced additively and must not remove existing workflows, routes, state, or service integrations. Existing screens are migrated incrementally; a screen is not replaced until its behavior and responsive states have been checked.

## Product UX principles

1. Make complex creative workflows understandable and progressively disclosed.
2. Keep the primary action of each screen obvious.
3. Preserve user work and make destructive actions explicit.
4. Distinguish sample/preview behavior from real connected services.
5. Give long-running generation and publishing tasks clear progress, recovery, and status.
6. Keep customer workspace, administrative tools, and owner-only controls separated by access boundary.
7. Design for desktop creation workflows while keeping essential tasks usable on tablet and mobile.
8. Support English and Burmese without relying on fixed text widths.

## Shared application surfaces

- Public website: discovery, product information, pricing, help, and legal content.
- Authentication: sign in, registration, recovery, verification, and session states.
- Onboarding: profile, workspace, preferences, and first-project guidance.
- Customer workspace: projects, storyboards, scenes, characters, media, AI assistant, and creative tools.
- Review and distribution: validation, approval, social connections, scheduling, and publishing history.
- Account and commerce: profile, settings, credits, plans, invoices, and transactions.
- Support: help center, tickets, feedback, and announcements.
- Administration: customer, plan, payment, provider, moderation, and support operations.
- Owner control center: platform-level configuration, cost, revenue, and emergency controls.

## Design token contract

- New shared UI should consume semantic `--vyra-*` tokens from `src/design-system/tokens.css`.
- The first token layer aliases the current Main palette to avoid an unreviewed visual break.
- New hard-coded colors, spacing, radii, and shadows should not be introduced when an existing semantic token or shared component can express the same intent.
- Theme changes must be driven through semantic tokens rather than page-specific overrides.

## Component contract

Use `src/components/ui` for shared primitives. Current primitives include Button, Card, PageHeader, StatusBadge, FormField, EmptyState, and LoadingState. Extend this library before introducing repeated page-specific patterns.

Shared components must:
- expose typed props and support composition;
- provide disabled, focus-visible, and loading states where relevant;
- use semantic HTML and accessible labels;
- allow responsive sizing and content expansion;
- avoid embedding product data or backend calls.

## Layout contract

Use shared layouts for public, authentication, customer workspace, admin, and owner surfaces. Keep navigation state and page content separate. Creative workspaces may use specialized layouts, but must retain shared typography, focus, status, and feedback conventions.

## Interaction contract

- Every visible action must have a defined outcome.
- Forms must expose validation and preserve entered values on recoverable errors.
- Destructive actions require explicit confirmation.
- Long-running work must expose progress, completion, failure, and retry/recovery states.
- Empty, loading, error, success, and permission-denied states are part of each feature's UI scope.
- Dialogs and drawers must support keyboard focus, Escape dismissal where safe, and mobile viewport constraints.

## Responsive and localization contract

- Validate representative desktop, tablet, and mobile widths.
- Avoid fixed heights for content that can expand.
- Use flexible layouts and wrapping for translated labels.
- Do not truncate essential actions or status information on mobile.
- Keep touch targets comfortably usable and provide visible keyboard focus.

## Migration plan

1. Add semantic tokens and shared primitives without changing existing screen behavior.
2. Adopt the primitives in shared navigation and common feedback surfaces.
3. Migrate existing views in small groups, validating visual and functional parity.
4. Build missing public, authentication, onboarding, support, and commerce pages on the same foundation.
5. Keep the legacy implementation until all relevant flows have been migrated and regression-checked.

## Acceptance checklist

- Existing Main workflows remain available.
- Light and dark theme states remain readable.
- English and Burmese text fit without clipping.
- Desktop, tablet, and mobile layouts remain usable.
- Keyboard focus is visible and dialogs are accessible.
- Buttons, forms, status, empty, and loading states are consistent.
- No backend, database, authentication, AI-provider, or payment behavior is changed by the UI foundation layer.
