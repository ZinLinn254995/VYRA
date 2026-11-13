/**
 * Product-wide AI Operator capability policy.
 *
 * This registry is the product boundary for AI access, not an executor. Each
 * capability must still be implemented by an authenticated server adapter
 * that re-checks owner scope, resource state, and the relevant approval.
 */
export type AiCapabilityAccess =
  | 'autonomous'
  | 'approval-required'
  | 'human-only'
  | 'owner-admin-only';

export type AiCapabilityRisk =
  | 'read'
  | 'reversible'
  | 'external'
  | 'destructive'
  | 'financial'
  | 'security';

export interface AiCapabilityPolicy {
  id: string;
  domain: string;
  access: AiCapabilityAccess;
  risk: AiCapabilityRisk;
  description: string;
}

const define = (
  domain: string,
  access: AiCapabilityAccess,
  risk: AiCapabilityRisk,
  entries: Array<[string, string]>,
): AiCapabilityPolicy[] => entries.map(([id, description]) => ({ id, domain, access, risk, description }));

export const VYRA_AI_CAPABILITIES: readonly AiCapabilityPolicy[] = [
  ...define('workspace', 'autonomous', 'read', [
    ['workspace.read', 'Read workspace state and recent activity'],
    ['workspace.navigate', 'Navigate between permitted app pages'],
    ['workspace.search', 'Search user-owned workspace content'],
    ['workspace.organize', 'Organize workspace views and filters'],
  ]),
  ...define('storyboard', 'autonomous', 'read', [
    ['storyboard.list', 'List and search storyboards'],
    ['storyboard.read', 'Read storyboard and scene details'],
    ['storyboard.analyze', 'Analyze pacing, continuity, and structure'],
    ['storyboard.suggest', 'Suggest storyboard improvements'],
  ]),
  ...define('storyboard', 'approval-required', 'reversible', [
    ['storyboard.create', 'Create a storyboard'],
    ['storyboard.update', 'Edit storyboard title, topic, and settings'],
    ['storyboard.duplicate', 'Duplicate a storyboard'],
    ['storyboard.reorder', 'Reorder storyboard scenes'],
    ['storyboard.restore', 'Restore a recoverable storyboard'],
  ]),
  ...define('storyboard', 'approval-required', 'destructive', [
    ['storyboard.delete', 'Delete a storyboard'],
    ['storyboard.delete_permanently', 'Permanently erase a storyboard'],
  ]),
  ...define('scene-editor', 'autonomous', 'read', [
    ['scene.read', 'Read scenes and scene metadata'],
    ['scene.analyze', 'Analyze scene continuity and composition'],
    ['scene.suggest', 'Suggest shot, script, and timing improvements'],
  ]),
  ...define('scene-editor', 'approval-required', 'reversible', [
    ['scene.create', 'Create a scene'],
    ['scene.update', 'Edit scene text, duration, transition, and settings'],
    ['scene.reorder', 'Reorder scenes'],
    ['scene.duplicate', 'Duplicate a scene'],
    ['scene.split', 'Split a scene'],
    ['scene.merge', 'Merge selected scenes'],
    ['scene.restore', 'Restore a scene revision'],
  ]),
  ...define('scene-editor', 'approval-required', 'destructive', [
    ['scene.delete', 'Delete a scene with explicit destructive confirmation'],
  ]),
  ...define('timeline', 'autonomous', 'read', [
    ['timeline.read', 'Read timeline tracks, clips, timing, and selection'],
    ['timeline.analyze', 'Analyze timing, gaps, overlaps, and synchronization'],
  ]),
  ...define('timeline', 'approval-required', 'reversible', [
    ['timeline.add_clip', 'Add a clip to a track'],
    ['timeline.move_clip', 'Move or trim a clip'],
    ['timeline.update_clip', 'Edit clip properties'],
    ['timeline.split_clip', 'Split a clip'],
    ['timeline.merge_clips', 'Merge compatible clips'],
    ['timeline.add_track', 'Add a timeline track'],
    ['timeline.update_track', 'Edit track properties'],
    ['timeline.reorder_tracks', 'Reorder tracks'],
    ['timeline.add_transition', 'Add, change, or remove transitions between adjacent scenes'],
    ['timeline.add_text', 'Add or edit text overlays'],
    ['timeline.add_audio', 'Add or edit audio clips'],
    ['timeline.attach_video', 'Attach a verified immutable Video Asset version to a Scene'],
    ['timeline.undo', 'Undo a reversible timeline operation'],
    ['timeline.redo', 'Redo a reversible timeline operation'],
  ]),
  ...define('timeline', 'approval-required', 'destructive', [
    ['timeline.remove_clip', 'Remove a timeline clip'],
    ['timeline.remove_track', 'Remove a timeline track'],
    ['timeline.clear', 'Clear timeline content'],
  ]),
  ...define('vyral', 'autonomous', 'read', [
    ['vyral.list', 'List and search owned Vyrals'],
    ['vyral.read', 'Read Vyral identity, settings, and Master DNA'],
    ['vyral.compare', 'Compare Vyrals and their Asset inventories'],
    ['vyral.audit', 'Audit DNA, Fingerprints, lineage, and provenance'],
    ['vyral.export', 'Prepare a Vyral DNA package for export'],
  ]),
  ...define('vyral', 'approval-required', 'reversible', [
    ['vyral.create', 'Create a Vyral identity'],
    ['vyral.update', 'Edit Vyral identity and descriptive settings'],
    ['vyral.switch', 'Switch the active Vyral context'],
    ['vyral.clone', 'Create a permitted Vyral branch'],
    ['vyral.import', 'Import a validated Vyral package'],
    ['vyral.restore', 'Restore a Vyral revision'],
    ['vyral.rebuild_master_dna', 'Rebuild Master DNA from canonical Asset DNA'],
  ]),
  ...define('vyral', 'approval-required', 'destructive', [
    ['vyral.archive', 'Archive a Vyral'],
    ['vyral.delete', 'Delete a Vyral when retention rules permit'],
    ['vyral.remove_branch', 'Remove a Vyral branch'],
  ]),
  ...define('assets', 'autonomous', 'read', [
    ['asset.list', 'List and search Assets'],
    ['asset.read', 'Read Asset metadata and version details'],
    ['asset.compare', 'Compare Asset versions and reconstructions'],
    ['asset.verify', 'Verify Asset identity and Fingerprint'],
    ['asset.analyze', 'Analyze Asset content and quality'],
    ['asset.relationships.read', 'Read Asset relationships and lineage'],
  ]),
  ...define('assets', 'approval-required', 'reversible', [
    ['asset.upload', 'Upload and ingest an Asset'],
    ['asset.update_metadata', 'Edit Asset metadata and tags'],
    ['asset.add_relationship', 'Add an Asset relationship'],
    ['asset.remove_relationship', 'Remove an Asset relationship'],
    ['asset.create_version', 'Create a new immutable Asset version'],
    ['asset.restore_version', 'Restore an earlier Asset version as a new version'],
    ['asset.export', 'Export an Asset or DNA package'],
    ['asset.move', 'Move an Asset between owned Vyrals'],
    ['asset.copy', 'Copy an Asset to another owned Vyral'],
  ]),
  ...define('assets', 'approval-required', 'destructive', [
    ['asset.archive', 'Archive an Asset'],
    ['asset.delete', 'Delete an Asset when retention rules permit'],
    ['asset.delete_version', 'Delete an Asset version when legally and technically permitted'],
  ]),
  ...define('media-generation', 'autonomous', 'read', [
    ['generation.models.read', 'Read available generation models and capabilities'],
    ['generation.estimate', 'Estimate generation cost and quality trade-offs'],
    ['generation.status', 'Read generation job status and results'],
    ['generation.retry_status', 'Inspect failed generation and recovery options'],
  ]),
  ...define('media-generation', 'approval-required', 'financial', [
    ['generation.image', 'Generate images within approved budget'],
    ['generation.video', 'Generate videos within approved budget'],
    ['generation.audio', 'Generate speech, music, and sound effects within approved budget'],
    ['generation.edit', 'Run AI media editing within approved budget'],
    ['generation.upscale', 'Upscale or enhance media within approved budget'],
    ['generation.retry', 'Retry a billable generation within the confirmed ceiling'],
  ]),
  ...define('media-editing', 'autonomous', 'read', [
    ['media.preview', 'Inspect and summarize media previews'],
    ['media.transcribe', 'Transcribe user-provided audio'],
    ['media.caption', 'Prepare subtitles and captions'],
    ['media.translate', 'Translate scripts and subtitles'],
    ['media.dub.preview', 'Prepare a dubbing preview'],
  ]),
  ...define('media-editing', 'approval-required', 'reversible', [
    ['media.trim', 'Trim media'],
    ['media.crop', 'Crop and reframe media'],
    ['media.resize', 'Resize media'],
    ['media.color', 'Adjust color and visual treatment'],
    ['media.mix_audio', 'Mix and normalize audio'],
    ['media.replace_audio', 'Replace audio in an edit'],
    ['media.subtitle.apply', 'Apply subtitles to an edit'],
    ['media.dub.apply', 'Apply generated dubbing to an edit'],
    ['media.render', 'Render an edited composition'],
  ]),
  ...define('media-editing', 'approval-required', 'destructive', [
    ['media.overwrite', 'Replace an existing media output'],
    ['media.discard_edit', 'Discard an unsaved editing session'],
  ]),
  ...define('media-library', 'autonomous', 'read', [
    ['library.list', 'List and search the Media Library'],
    ['library.read', 'Read Media Library item details'],
    ['library.organize.read', 'Read folders, collections, and organization'],
  ]),
  ...define('media-library', 'approval-required', 'reversible', [
    ['library.folder.create', 'Create a Media Library folder'],
    ['library.folder.rename', 'Rename a folder'],
    ['library.move', 'Move library items'],
    ['library.copy', 'Copy library items'],
    ['library.tag', 'Tag and categorize library items'],
  ]),
  ...define('media-library', 'approval-required', 'destructive', [
    ['library.delete', 'Delete library items'],
    ['library.folder.delete', 'Delete a folder and handle its contents'],
  ]),
  ...define('marketplace', 'autonomous', 'read', [
    ['marketplace.search', 'Search Marketplace listings'],
    ['marketplace.read', 'Read listing details and license terms'],
    ['marketplace.compare', 'Compare listings and versions'],
    ['marketplace.sales.read', 'Read own sales and purchase history'],
  ]),
  ...define('marketplace', 'approval-required', 'external', [
    ['marketplace.purchase', 'Purchase a listing after price and license review'],
    ['marketplace.publish_listing', 'Publish a Vyral listing'],
    ['marketplace.update_listing', 'Update an owned listing'],
    ['marketplace.unpublish_listing', 'Unpublish an owned listing'],
    ['marketplace.accept_license', 'Accept a license for the current purchase'],
  ]),
  ...define('marketplace', 'human-only', 'financial', [
    ['marketplace.payout_method', 'Add or change payout destination'],
    ['marketplace.withdraw', 'Withdraw creator earnings'],
    ['marketplace.refund_override', 'Override a refund or dispute outcome'],
  ]),
  ...define('publishing', 'autonomous', 'read', [
    ['publishing.accounts.read', 'Read connected social account status'],
    ['publishing.preview', 'Prepare a publish preview and validate requirements'],
    ['publishing.analytics.read', 'Read publishing analytics'],
  ]),
  ...define('publishing', 'approval-required', 'external', [
    ['publishing.schedule', 'Schedule an external social post'],
    ['publishing.publish', 'Publish content to an external platform'],
    ['publishing.cancel', 'Cancel a scheduled post'],
    ['publishing.update_post', 'Edit a scheduled post'],
  ]),
  ...define('profile-settings', 'autonomous', 'read', [
    ['profile.read', 'Read the signed-in user profile'],
    ['settings.read', 'Read user preferences and app settings'],
  ]),
  ...define('profile-settings', 'approval-required', 'reversible', [
    ['profile.update', 'Edit non-sensitive profile fields'],
    ['settings.update', 'Change language, theme, and non-security preferences'],
    ['notifications.update', 'Change notification preferences'],
  ]),
  ...define('account-security', 'human-only', 'security', [
    ['auth.password.change', 'Change account password'],
    ['auth.mfa.change', 'Enable or disable multi-factor authentication'],
    ['auth.email.change', 'Change sign-in email address'],
    ['auth.sessions.revoke', 'Revoke active sessions'],
    ['auth.account.delete', 'Permanently delete the user account'],
    ['privacy.export_sensitive', 'Export sensitive personal account data'],
  ]),
  ...define('admin', 'owner-admin-only', 'security', [
    ['admin.provider_key.manage', 'Configure platform provider credentials'],
    ['admin.pricing.activate', 'Activate platform credit pricing policies'],
    ['admin.billing.policy', 'Change platform billing and credit policies'],
    ['admin.user.access', 'Change user roles or access'],
    ['admin.audit.read', 'Read privileged administrative audit records'],
    ['admin.feature_flags', 'Change global feature availability'],
    ['admin.data_repair', 'Run privileged data repair operations'],
  ]),
  ...define('platform-operations', 'human-only', 'security', [
    ['platform.production.deploy', 'Deploy or roll back production'],
    ['platform.database.migrate', 'Apply production database migrations'],
    ['platform.secrets.rotate', 'Rotate production secrets'],
    ['platform.ownership.transfer', 'Transfer platform or project ownership'],
  ]),
] as const;

const CAPABILITY_INDEX = new Map(VYRA_AI_CAPABILITIES.map((item) => [item.id, item]));

export function getAiCapabilityPolicy(id: string): AiCapabilityPolicy | null {
  return CAPABILITY_INDEX.get(id) ?? null;
}

export function mayAiPerformCapability(
  id: string,
  context: { userAuthenticated: boolean; isOwnerOrAdmin?: boolean; approvalGranted?: boolean },
): { allowed: boolean; reason: 'allowed' | 'authentication-required' | 'human-only' | 'owner-admin-only' | 'approval-required' | 'unknown-capability' } {
  const policy = getAiCapabilityPolicy(id);
  if (!policy) return { allowed: false, reason: 'unknown-capability' };
  if (!context.userAuthenticated) return { allowed: false, reason: 'authentication-required' };
  if (policy.access === 'human-only') return { allowed: false, reason: 'human-only' };
  if (policy.access === 'owner-admin-only' && !context.isOwnerOrAdmin) return { allowed: false, reason: 'owner-admin-only' };
  if (policy.access === 'approval-required' && !context.approvalGranted) return { allowed: false, reason: 'approval-required' };
  return { allowed: true, reason: 'allowed' };
}

export function summarizeAiCapabilityCoverage(): {
  total: number;
  autonomous: number;
  approvalRequired: number;
  humanOnly: number;
  ownerAdminOnly: number;
  domains: string[];
} {
  return {
    total: VYRA_AI_CAPABILITIES.length,
    autonomous: VYRA_AI_CAPABILITIES.filter((item) => item.access === 'autonomous').length,
    approvalRequired: VYRA_AI_CAPABILITIES.filter((item) => item.access === 'approval-required').length,
    humanOnly: VYRA_AI_CAPABILITIES.filter((item) => item.access === 'human-only').length,
    ownerAdminOnly: VYRA_AI_CAPABILITIES.filter((item) => item.access === 'owner-admin-only').length,
    domains: [...new Set(VYRA_AI_CAPABILITIES.map((item) => item.domain))],
  };
}
