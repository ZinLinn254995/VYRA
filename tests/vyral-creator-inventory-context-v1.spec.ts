import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVyralCreatorInventoryContextV1 } from '../src/services/vyralCreatorInventoryContextV1.ts';

test('summarizes mixed asset inventory using explicit type before MIME fallback', () => {
  const context = buildVyralCreatorInventoryContextV1({
    assets: [
      { id: 'a', asset_type: 'Character', mime_type: 'image/png' },
      { id: 'b', mime_type: 'audio/wav' },
      { id: 'c', mime_type: 'application/pdf' },
      { id: 'd', mime_type: 'application/octet-stream' },
    ],
    purpose: { summary: null, intended_uses: [] },
    relationships: [],
  });
  assert.equal(context.assetCount, 4);
  assert.deepEqual(context.typeCounts, { character: 1, audio: 1, document: 1, other: 1 });
  assert.equal(context.declaredPurpose, null);
  assert.deepEqual(context.intendedUses, []);
  assert.equal(context.relationshipsCount, 0);
});

test('preserves creator-declared purpose and unrelated asset freedom', () => {
  const context = buildVyralCreatorInventoryContextV1({
    assets: [{ id: 'x', mime_type: 'image/png' }, { id: 'y', mime_type: 'audio/mpeg' }],
    purpose: { summary: 'Personal reference collection', intended_uses: ['reference'] },
  });
  assert.deepEqual(context.typeCounts, { image: 1, audio: 1 });
  assert.equal(context.declaredPurpose, 'Personal reference collection');
  assert.deepEqual(context.intendedUses, ['reference']);
  assert.equal(context.relationshipsCount, 0);
});

test('rejects missing inventory identity and malformed declared uses', () => {
  assert.throws(() => buildVyralCreatorInventoryContextV1({ assets: [{ id: '' }] }), /stable ID/);
  assert.throws(() => buildVyralCreatorInventoryContextV1({
    assets: [{ id: 'x' }],
    purpose: { intended_uses: ['  '] },
  }), /non-empty strings/);
});
