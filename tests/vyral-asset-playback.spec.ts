import test from 'node:test';
import assert from 'node:assert/strict';
import { createVyralAudioPlaybackUrl } from '../src/services/vyralAssetPlayback';

const userId = '10000000-0000-4000-8000-000000000001';
const vyralId = '20000000-0000-4000-8000-000000000001';
const assetId = '30000000-0000-4000-8000-000000000001';
const versionId = '40000000-0000-4000-8000-000000000001';
const path = userId + '/' + vyralId + '/' + assetId + '/v1/' + assetId + '.mp3';

function makeDb(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const records: Record<string, unknown> = {
    vyral_assets: { id: assetId, user_id: userId, vyral_id: vyralId, asset_type: 'audio', mime_type: 'audio/mpeg', processing_status: 'ready', storage_path: path },
    vyral_asset_versions: { id: versionId, asset_id: assetId, user_id: userId, mime_type: 'audio/mpeg', storage_path: path },
    ...overrides,
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table: string) {
      const call = { table, filters: [] as Array<[string, unknown]> };
      calls.push(call);
      const query = {
        select() { return query; },
        eq(field: string, value: unknown) { call.filters.push([field, value]); return query; },
        maybeSingle: async () => ({ data: records[table] ?? null, error: null }),
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl: async (storagePath: string, ttl: number, options: unknown) => ({
            data: { signedUrl: 'https://storage.example/signed/audio' }, error: null,
            bucket, storagePath, ttl, options,
          }),
        };
      },
    },
    calls,
  };
  return db;
}

test('creates a short-lived signed URL only after owner and immutable version checks', async () => {
  const db = makeDb();
  const result = await createVyralAudioPlaybackUrl(db, { assetId, versionId });
  assert.equal(result.signedUrl, 'https://storage.example/signed/audio');
  assert.equal(result.expiresInSeconds, 3600);
  assert.deepEqual(db.calls.map((call) => call.table), ['vyral_assets', 'vyral_asset_versions']);
  assert.ok(db.calls[0].filters.some(([field, value]) => field === 'user_id' && value === userId));
  assert.ok(db.calls[1].filters.some(([field, value]) => field === 'user_id' && value === userId));
});

test('rejects invalid IDs before touching the database', async () => {
  const db = makeDb();
  await assert.rejects(() => createVyralAudioPlaybackUrl(db, { assetId: 'not-an-id', versionId }), /valid Audio Asset/);
  assert.equal(db.calls.length, 0);
});

test('rejects non-audio or non-ready assets', async () => {
  const notReady = makeDb({ vyral_assets: { id: assetId, user_id: userId, vyral_id: vyralId, asset_type: 'audio', mime_type: 'audio/mpeg', processing_status: 'uploading', storage_path: path } });
  await assert.rejects(() => createVyralAudioPlaybackUrl(notReady, { assetId, versionId }), /unavailable/);
  const wrongType = makeDb({ vyral_assets: { id: assetId, user_id: userId, vyral_id: vyralId, asset_type: 'image', mime_type: 'image/png', processing_status: 'ready', storage_path: path } });
  await assert.rejects(() => createVyralAudioPlaybackUrl(wrongType, { assetId, versionId }), /unavailable/);
});

test('rejects cross-asset versions and mismatched or unsafe storage paths', async () => {
  const otherVersion = makeDb({ vyral_asset_versions: { id: versionId, asset_id: '50000000-0000-4000-8000-000000000001', user_id: userId, mime_type: 'audio/mpeg', storage_path: path } });
  await assert.rejects(() => createVyralAudioPlaybackUrl(otherVersion, { assetId, versionId }), /could not be verified/);
  const unsafePath = makeDb({ vyral_asset_versions: { id: versionId, asset_id: assetId, user_id: userId, mime_type: 'audio/mpeg', storage_path: userId + '/../../private.mp3' } });
  await assert.rejects(() => createVyralAudioPlaybackUrl(unsafePath, { assetId, versionId }), /storage reference/);
});

test('rejects version MIME mismatches and never creates a public URL', async () => {
  const wrongMime = makeDb({ vyral_asset_versions: { id: versionId, asset_id: assetId, user_id: userId, mime_type: 'image/png', storage_path: path } });
  await assert.rejects(() => createVyralAudioPlaybackUrl(wrongMime, { assetId, versionId }), /storage reference/);
});

test('allows an older immutable version path within the same owner and Asset namespace', async () => {
  const olderPath = userId + '/' + vyralId + '/' + assetId + '/v1/' + assetId + '-old.mp3';
  const db = makeDb({
    vyral_assets: { id: assetId, user_id: userId, vyral_id: vyralId, asset_type: 'audio', mime_type: 'audio/mpeg', processing_status: 'ready', storage_path: path.replace('/v1/', '/v2/') },
    vyral_asset_versions: { id: versionId, asset_id: assetId, user_id: userId, mime_type: 'audio/mpeg', storage_path: olderPath },
  });
  const result = await createVyralAudioPlaybackUrl(db, { assetId, versionId });
  assert.equal(result.signedUrl, 'https://storage.example/signed/audio');
});
