export type VyralAudioPlaybackRequest = { assetId: string; versionId: string };
export type VyralAudioPlaybackResult = { signedUrl: string; expiresInSeconds: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Create a short-lived URL for an exact immutable Audio Asset Version.
 * Ownership is resolved from the active Supabase session, never from caller input.
 * Both relational RLS and the private Storage bucket's owner policy are enforced.
 */
export async function createVyralAudioPlaybackUrl(
  db: any,
  request: VyralAudioPlaybackRequest,
): Promise<VyralAudioPlaybackResult> {
  if (!db || !UUID.test(request.assetId) || !UUID.test(request.versionId)) {
    throw new Error('A valid Audio Asset and immutable Version are required.');
  }

  const { data: authData, error: authError } = await db.auth.getUser();
  const user = authData?.user;
  if (authError || !user?.id || !UUID.test(user.id)) {
    throw new Error('Sign in again before previewing this Audio Asset.');
  }

  const { data: asset, error: assetError } = await db.from('vyral_assets')
    .select('id,user_id,vyral_id,asset_type,mime_type,processing_status,storage_path')
    .eq('id', request.assetId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (assetError || !asset || asset.user_id !== user.id || asset.asset_type !== 'audio' || asset.processing_status !== 'ready') {
    throw new Error('This Audio Asset is unavailable or is not owned by the signed-in account.');
  }

  const { data: version, error: versionError } = await db.from('vyral_asset_versions')
    .select('id,asset_id,user_id,mime_type,storage_path')
    .eq('id', request.versionId)
    .eq('asset_id', asset.id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (versionError || !version || version.id !== request.versionId || version.asset_id !== asset.id || version.user_id !== user.id) {
    throw new Error('The requested immutable Audio Version could not be verified.');
  }

  const mimeType = String(version.mime_type || asset.mime_type || '').toLowerCase();
  const storagePath = typeof version.storage_path === 'string' ? version.storage_path : '';
  const expectedPrefix = user.id + '/' + asset.vyral_id + '/' + asset.id + '/';
  if (!mimeType.startsWith('audio/') || !storagePath ||
      !storagePath.startsWith(expectedPrefix) || storagePath.includes('..') || storagePath.startsWith('/') || storagePath.includes('\\')) {
    throw new Error('The Audio Version storage reference failed its ownership or file-type checks.');
  }

  const { data: signed, error: signedError } = await db.storage.from('vyral-assets')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download: false });
  if (signedError || typeof signed?.signedUrl !== 'string' || !/^https:\/\//i.test(signed.signedUrl)) {
    throw new Error('A secure Audio preview link could not be created.');
  }

  return { signedUrl: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
}
