import test from 'node:test';
import assert from 'node:assert/strict';
import { createVyralMasterDnaV1, validateVyralMasterDnaV1 } from '../src/services/vyralMasterDnaV1.ts';

const input = {
  master_dna_id: 'master-1',
  vyral: { vyral_id: 'vyral-1', name: 'Character Kit', owner_ref: null, created_at: '2026-11-06T00:00:00.000Z' },
  snapshot: { revision: 1, created_at: '2026-11-06T00:00:00.000Z', parent_master_dna_id: null },
  purpose: { summary: 'A consistent character and its production resources.', intended_uses: ['storyboarding', 'video generation'] },
  main_asset_ids: ['character'],
  assets: [
    {
      asset_id: 'character', asset_version_id: 'character-v1', role: 'main' as const,
      purpose: 'Defines the primary character appearance.', media_type: 'image/png',
      dna_ref: { record_id: 'dna-character', schema_id: 'vyra.asset-dna', schema_version: 3 },
      asset_fingerprint: 'a'.repeat(64), reconstruction_claim: 'lossless_decoded' as const,
    },
    {
      asset_id: 'voice', asset_version_id: 'voice-v1', role: 'supporting' as const,
      purpose: 'Provides the character voice identity.', media_type: 'audio/wav',
      dna_ref: { record_id: 'dna-voice', schema_id: 'vyra.asset-dna', schema_version: 1 },
      asset_fingerprint: 'b'.repeat(64), reconstruction_claim: 'semantic_only' as const,
    },
  ],
  relationships: [
    { relationship_id: 'edge-1', type: 'belongs_to', from: { kind: 'asset' as const, asset_id: 'character', asset_version_id: 'character-v1' }, to: { kind: 'vyral' as const, vyral_id: 'vyral-1' }, rationale: 'The character is the primary subject of this Vyral.' },
    { relationship_id: 'edge-2', type: 'audio_for', from: { kind: 'asset' as const, asset_id: 'voice' }, to: { kind: 'asset' as const, asset_id: 'character' }, rationale: 'This voice profile belongs to the character.' },
  ],
  reconstruction_profile: { overall_claim: 'semantic_only' as const, notes: ['Image samples are losslessly decoded; voice is semantic only.'] },
  provenance: { creator_ref: null, license_ref: null, evidence_status: 'creator_attested' as const },
  source_resolution: { visibility: 'private' as const, canonical_uri: null, resolution_policy: 'authenticated_owner' as const },
  portable_projection: { profile: 'compact' as const, includes_full_reconstruction_payloads: false as const, resolver_uri: null, retrieval_policy: 'authorized_selective_retrieval' as const, max_assets_per_request: 4 },
};

test('creates and verifies a canonical Master DNA snapshot and Vyral fingerprint', async () => {
  const record = await createVyralMasterDnaV1(input);
  assert.equal(record.integrity.manifest_sha256.length, 64);
  assert.equal(record.integrity.vyral_fingerprint.length, 64);
  assert.equal((await validateVyralMasterDnaV1(record)).master_dna_id, 'master-1');
});

test('rejects a modified snapshot and a modified asset purpose', async () => {
  const record = await createVyralMasterDnaV1(input);
  await assert.rejects(() => validateVyralMasterDnaV1({ ...record, purpose: { ...record.purpose, summary: 'tampered' } }), /manifest digest verification failed/);
  await assert.rejects(() => createVyralMasterDnaV1({ ...input, assets: input.assets.map((asset, i) => i === 0 ? { ...asset, purpose: '  ' } : asset) }), /asset entry is invalid/);
});

test('requires every asset to have an explicit relationship to another asset or the Vyral root', async () => {
  const invalid = { ...input, relationships: input.relationships.slice(0, 1) };
  await assert.rejects(() => createVyralMasterDnaV1(invalid), /Every Master DNA asset/);
  const selfOnly = {
    ...input,
    relationships: [
      input.relationships[0],
      { relationship_id: 'self-edge', type: 'references', from: { kind: 'asset' as const, asset_id: 'voice' }, to: { kind: 'asset' as const, asset_id: 'voice' }, rationale: 'Self references are not membership relationships.' },
    ],
  };
  await assert.rejects(() => createVyralMasterDnaV1(selfOnly), /Every Master DNA asset/);
});

test('rejects cross-Vyral links, stale asset versions, and private public-asset resolution', async () => {
  await assert.rejects(() => createVyralMasterDnaV1({ ...input, relationships: input.relationships.map((edge, i) => i === 0 ? { ...edge, to: { kind: 'vyral' as const, vyral_id: 'other-vyral' } } : edge) }), /different Vyral root/);
  await assert.rejects(() => createVyralMasterDnaV1({ ...input, relationships: input.relationships.map((edge, i) => i === 0 ? { ...edge, from: { kind: 'asset' as const, asset_id: 'character', asset_version_id: 'old-version' } } : edge) }), /asset version outside/);
  await assert.rejects(() => createVyralMasterDnaV1({ ...input, source_resolution: { ...input.source_resolution, resolution_policy: 'public_assets' as const } }), /cannot expose public metadata/);
});

test('rejects an overall reconstruction claim stronger than the weakest asset', async () => {
  await assert.rejects(
    () => createVyralMasterDnaV1({ ...input, reconstruction_profile: { ...input.reconstruction_profile, overall_claim: 'lossless_decoded' as const } }),
    /must not exceed the weakest included asset claim/,
  );
});

test('private and unlisted Vyrals cannot expose public resolver metadata', async () => {
  await assert.rejects(
    () => createVyralMasterDnaV1({ ...input, source_resolution: { ...input.source_resolution, canonical_uri: 'https://example.invalid/vyral' } }),
    /cannot expose public metadata/,
  );
  await assert.rejects(
    () => createVyralMasterDnaV1({ ...input, portable_projection: { ...input.portable_projection, retrieval_policy: 'public_metadata_only' as const } }),
    /cannot publish metadata-only resolution/,
  );
});

test('requires at least one declared intended use for a Vyral', async () => {
  await assert.rejects(
    () => createVyralMasterDnaV1({ ...input, purpose: { ...input.purpose, intended_uses: [] } }),
    /purpose, asset inventory, or relationships are invalid/,
  );
});

test('requires Main Assets to link to the Vyral root and Supporting Assets to a Main Asset', async () => {
  const noMainMembership = {
    ...input,
    relationships: input.relationships.map((edge, index) => index === 0 ? { ...edge, type: 'references' } : edge),
  };
  await assert.rejects(() => createVyralMasterDnaV1(noMainMembership), /Main Asset must have a membership edge/);
  const supportToRoot = {
    ...input,
    relationships: input.relationships.map((edge, index) => index === 1
      ? { ...edge, to: { kind: 'vyral' as const, vyral_id: 'vyral-1' } }
      : edge),
  };
  await assert.rejects(() => createVyralMasterDnaV1(supportToRoot), /Supporting Asset must have a membership edge/);
});
