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
  portable_projection: { profile: 'compact' as const, includes_full_reconstruction_payloads: false as const, resolver_uri: null, retrieval_policy: 'no_remote_resolution' as const, max_assets_per_request: 4 },
};

test('creates and verifies a canonical Master DNA snapshot and Vyral fingerprint', async () => {
  const record = await createVyralMasterDnaV1(input);
  assert.equal(record.integrity.manifest_sha256.length, 64);
  assert.equal(record.integrity.vyral_fingerprint.length, 64);
  assert.equal((await validateVyralMasterDnaV1(record)).master_dna_id, 'master-1');
});

test('rejects a modified snapshot and an invalid optional asset purpose', async () => {
  const record = await createVyralMasterDnaV1(input);
  await assert.rejects(() => validateVyralMasterDnaV1({ ...record, purpose: { ...(record.purpose ?? {}), summary: 'tampered' } }), /manifest digest verification failed/);
  await assert.rejects(() => createVyralMasterDnaV1({ ...input, assets: input.assets.map((asset, i) => i === 0 ? { ...asset, purpose: '  ' } : asset) }), /asset entry is invalid/);
});

test('keeps collection identity stable while inventory labels affect the snapshot fingerprint', async () => {
  const first = await createVyralMasterDnaV1(input);
  const renamed = await createVyralMasterDnaV1({
    ...input,
    assets: input.assets.map((asset, index) => index === 0 ? { ...asset, name: 'Renamed character' } : asset),
  });
  assert.equal(renamed.master_dna_id, first.master_dna_id);
  assert.notEqual(renamed.integrity.manifest_sha256, first.integrity.manifest_sha256);
});

test('allows a single Asset Vyral without roles, purpose, or relationships', async () => {
  const { purpose: _purpose, relationships: _relationships, ...base } = input;
  const single = {
    ...base,
    main_asset_ids: [],
    assets: [{
      asset_id: 'one', asset_version_id: 'one-v1', media_type: 'image/png',
      dna_ref: { record_id: 'dna-one', schema_id: 'vyra.asset-dna', schema_version: 3 },
      asset_fingerprint: 'e'.repeat(64), reconstruction_claim: 'lossless_decoded' as const,
    }],
    reconstruction_profile: { overall_claim: 'lossless_decoded' as const, notes: [] },
  };
  const record = await createVyralMasterDnaV1(single);
  assert.equal(record.assets.length, 1);
  assert.deepEqual(record.relationships ?? [], []);
  assert.deepEqual(record.main_asset_ids, []);
  assert.equal((await validateVyralMasterDnaV1(record)).vyral.vyral_id, 'vyral-1');
});

test('allows multiple unrelated Assets with no creator context or relationships', async () => {
  const unrelated = {
    ...input,
    purpose: { summary: null, intended_uses: [] },
    main_asset_ids: [],
    assets: input.assets.map(({ role: _role, purpose: _purpose, ...asset }) => asset),
    relationships: [],
  };
  const record = await createVyralMasterDnaV1(unrelated);
  assert.equal(record.assets.length, 2);
  assert.deepEqual(record.relationships ?? [], []);
  assert.deepEqual(record.main_asset_ids, []);
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
    /Private or unlisted compact DNA cannot publish/,
  );
});

test('allows omitted or empty optional Vyral purpose and intended uses', async () => {
  const record = await createVyralMasterDnaV1({ ...input, purpose: { summary: null, intended_uses: [] } });
  assert.deepEqual(record.purpose, { summary: null, intended_uses: [] });
});


import { preflightVyralMasterDna } from '../src/services/vyralMasterDnaPreflight.ts';

test('preflight accepts single and unrelated Assets without optional metadata', () => {
  assert.deepEqual(preflightVyralMasterDna({
    assets: [{ asset_id: 'single', has_latest_version: true, has_matching_dna: true }],
  }), []);
  assert.deepEqual(preflightVyralMasterDna({
    assets: [
      { asset_id: 'unrelated-a', has_latest_version: true, has_matching_dna: true },
      { asset_id: 'unrelated-b', has_latest_version: true, has_matching_dna: true },
    ],
  }), []);
});

test('preflight blocks unsupported or version-mismatched DNA as incomplete Asset DNA', () => {
  assert.deepEqual(preflightVyralMasterDna({
    assets: [{ asset_id: 'needs-supported-dna', has_latest_version: true, has_matching_dna: false }],
  }).map((item) => item.code), ['missing_asset_dna']);
});

test('preflight blocks only missing source versions or matching Asset DNA', () => {
  const blockers = preflightVyralMasterDna({
    assets: [
      { asset_id: 'needs-version', has_latest_version: false, has_matching_dna: true },
      { asset_id: 'needs-dna', has_latest_version: true, has_matching_dna: false },
    ],
  });
  assert.deepEqual(blockers.map((item) => item.code), ['missing_asset_version', 'missing_asset_dna']);
});


test('publishes only a canonical public resolver URI and never exposes one for private Vyrals', async () => {
  const resolverUri = 'https://wbqheogfoahnjvgkwhxe.supabase.co/functions/v1/resolve-public-vyral-resource';
  const publicRecord = await createVyralMasterDnaV1({
    ...input,
    source_resolution: { visibility: 'public', canonical_uri: null, resolution_policy: 'public_assets' },
    portable_projection: {
      profile: 'compact',
      includes_full_reconstruction_payloads: false,
      resolver_uri: resolverUri,
      retrieval_policy: 'authorized_selective_retrieval',
    },
  });
  assert.equal(publicRecord.portable_projection.resolver_uri, resolverUri);
  await assert.rejects(() => createVyralMasterDnaV1({
    ...input,
    source_resolution: { visibility: 'public', canonical_uri: null, resolution_policy: 'public_assets' },
    portable_projection: {
      ...input.portable_projection,
      resolver_uri: 'https://attacker.example/collect',
      retrieval_policy: 'authorized_selective_retrieval',
    },
  }), /unsafe resolver URI/);
  await assert.rejects(() => createVyralMasterDnaV1({
    ...input,
    portable_projection: {
      ...input.portable_projection,
      resolver_uri: resolverUri,
      retrieval_policy: 'authorized_selective_retrieval',
    },
  }), /A public resolver URI requires public visibility/);
});
