import test from 'node:test';
import assert from 'node:assert/strict';
import { getVyralAssetLocalCopy, saveVyralAssetLocalCopy } from '../src/services/vyralAssetLocalCache';

test('local offline cache safely degrades when browser storage is unavailable', async () => {
  const originalIndexedDb = globalThis.indexedDB;
  try {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
    const saved = await saveVyralAssetLocalCopy({
      userId: 'user', assetId: 'asset', versionId: 'version',
      mimeType: 'video/mp4', sizeBytes: 4, blob: new Blob(['test'], { type: 'video/mp4' }),
    });
    assert.equal(saved, false);
    assert.equal(await getVyralAssetLocalCopy('user', 'asset', 'version'), null);
  } finally {
    if (originalIndexedDb === undefined) delete (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    else Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: originalIndexedDb });
  }
});
