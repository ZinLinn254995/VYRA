export const VYRAL_SYSTEM_FILES_VERSION = 1 as const;
export type VyralSystemFileDescriptorV1 = { path: string; kind: string; required: boolean; protected: true; source: string; state: 'present' | 'empty' | 'not_available' };
export type VyralSystemFileEntryV1 = { path: string; data: string };
const SYSTEM_SOURCES = [
  { path: 'manifest.json', kind: 'package_manifest', source: 'package.manifest', required: true },
  { path: 'system/identity.json', kind: 'identity', source: 'manifest.vyral', required: true },
  { path: 'system/asset-index.json', kind: 'asset_index', source: 'manifest.assets', required: true },
  { path: 'system/asset-dna/index.json', kind: 'asset_dna_index', source: 'manifest.dnaRecords', required: true },
  { path: 'system/master-dna.ref.json', kind: 'master_dna_reference', source: 'manifest.masterDna', required: true },
  { path: 'system/fingerprints/index.json', kind: 'fingerprint_index', source: 'manifest.fingerprints', required: true },
  { path: 'system/provenance/index.json', kind: 'provenance_index', source: 'manifest.lineage', required: true },
  { path: 'system/relationships/index.json', kind: 'relationship_index', source: 'manifest.masterDna.relationships', required: true },
  { path: 'system/classifications/index.json', kind: 'classification_index', source: 'manifest.assets[].asset_type', required: true },
  { path: 'system/creator-instructions/index.json', kind: 'creator_instructions', source: 'manifest.vyral.metadata.creator_instructions', required: true },
  { path: 'system/licensing.json', kind: 'licensing', source: 'manifest.vyral.license_policy', required: true },
  { path: 'system/integrity.json', kind: 'integrity', source: 'package.entries', required: true },
] as const;
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const array = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x)) : [];
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const digest = async (bytes: Uint8Array) => { if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SHA-256 is unavailable.'); const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes); const result = await globalThis.crypto.subtle.digest('SHA-256', buffer); return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join(''); };
/** System Files are read-only projections of existing package records, never a second canonical database. */
export const buildVyralSystemFilesV1 = async (manifestValue: Record<string, unknown>, existingEntries: Array<{ path: string; data: Uint8Array | string }> = []): Promise<{ descriptors: VyralSystemFileDescriptorV1[]; entries: VyralSystemFileEntryV1[] }> => {
  const manifest = record(manifestValue);
  if (manifest.format !== 'application/vnd.vyra.vyral+zip' || !Number.isSafeInteger(manifest.formatVersion) || !record(manifest.vyral).id || !Array.isArray(manifest.assets) || !Array.isArray(manifest.dnaRecords) || !Array.isArray(manifest.fingerprints) || !Array.isArray(manifest.versions)) throw new Error('Cannot build Vyral System Files from an invalid package manifest.');
  const assets = array(manifest.assets); const dnaRecords = array(manifest.dnaRecords); const fingerprints = array(manifest.fingerprints); const master = record(manifest.masterDna); const vyral = record(manifest.vyral); const metadata = record(vyral.metadata);
  const states: Record<string, VyralSystemFileDescriptorV1['state']> = { 'manifest.json':'present', 'system/identity.json':'present', 'system/asset-index.json':'present', 'system/asset-dna/index.json':dnaRecords.length?'present':'empty', 'system/master-dna.ref.json':Object.keys(master).length?'present':'not_available', 'system/fingerprints/index.json':fingerprints.length?'present':'empty', 'system/provenance/index.json':array(manifest.lineage).length?'present':'empty', 'system/relationships/index.json':array(master.relationships).length?'present':'empty', 'system/classifications/index.json':assets.length?'present':'empty', 'system/creator-instructions/index.json':metadata.creator_instructions?'present':'not_available', 'system/licensing.json':'present', 'system/integrity.json':'present' };
  const descriptors: VyralSystemFileDescriptorV1[] = [
    ...SYSTEM_SOURCES.map(item => ({ ...item, protected: true as const, state: states[item.path] })),
    { path:'system/system-files.json', kind:'system_file_index', source:'package.systemFiles', required:true, protected:true, state:'present' },
  ];
  const payloads: Record<string, unknown> = {
    'system/identity.json': { schema:'vyra.vyral-system-identity', version:1, source:'manifest.vyral', identity:vyral },
    'system/asset-index.json': { schema:'vyra.vyral-asset-index', version:1, source:'manifest.assets', assets:assets.map(a=>({ id:a.id, name:a.name, asset_type:a.asset_type, mime_type:a.mime_type, folder_id:a.folder_id, version_ids:array(manifest.versions).filter(v=>v.asset_id===a.id).map(v=>v.id) })) },
    'system/asset-dna/index.json': { schema:'vyra.vyral-asset-dna-index', version:1, source:'manifest.dnaRecords', records:dnaRecords.map(d=>({ record_id:d.id, asset_id:d.asset_id, scope:d.scope, schema_id:d.dna_schema_id??record(d.payload).dna_schema_id, schema_version:d.dna_schema_version??record(d.payload).dna_schema_version, created_at:d.created_at })), note:'References existing package DNA records; raw payloads and tiles are not duplicated.' },
    'system/master-dna.ref.json': { schema:'vyra.vyral-master-dna-reference', version:1, source:'manifest.masterDna', available:Object.keys(master).length>0, master_dna_id:master.master_dna_id??null, revision:record(master.snapshot).revision??null, manifest_sha256:record(master.integrity).manifest_sha256??null, note:'Reference only. Canonical Master DNA snapshot is stored once in manifest.masterDna.' },
    'system/fingerprints/index.json': { schema:'vyra.vyral-fingerprint-index', version:1, source:'manifest.fingerprints', fingerprints:fingerprints.map(f=>({ id:f.id, asset_id:f.asset_id, asset_version_id:f.asset_version_id, fingerprint_kind:f.fingerprint_kind, algorithm:f.algorithm, value:f.value })) },
    'system/provenance/index.json': { schema:'vyra.vyral-provenance-index', version:1, source:'manifest.lineage', lineage:array(manifest.lineage), note:'Only recorded lineage is included; no ownership or legal rights are inferred.' },
    'system/relationships/index.json': { schema:'vyra.vyral-relationship-index', version:1, source:'manifest.masterDna.relationships', relationships:array(master.relationships) },
    'system/classifications/index.json': { schema:'vyra.vyral-classification-index', version:1, source:'manifest.assets[].asset_type', classifications:assets.map(a=>({ asset_id:a.id, asset_type:a.asset_type??'unknown', mime_type:a.mime_type??null })) },
    'system/creator-instructions/index.json': { schema:'vyra.vyral-creator-instructions', version:1, source:'manifest.vyral.metadata.creator_instructions', state:metadata.creator_instructions?'present':'not_available', instructions:metadata.creator_instructions??null },
    'system/licensing.json': { schema:'vyra.vyral-licensing', version:1, source:'manifest.vyral.license_policy', policy:record(vyral.license_policy), note:'Declared policy is not a verified grant or server-side authorization.' },
  };
  const integritySources = [
    ...existingEntries,
    ...Object.entries(payloads).filter(([path]) => path !== 'system/integrity.json').map(([path, value]) => ({ path, data: json(value) })),
  ];
  const covered = await Promise.all(integritySources.filter(e=>e.path!=='manifest.json'&&e.path!=='system/system-files.json').map(async e=>{ const bytes=typeof e.data==='string'?new TextEncoder().encode(e.data):e.data; return {path:e.path,size_bytes:bytes.byteLength,sha256:await digest(bytes)}; }));
  payloads['system/integrity.json'] = { schema:'vyra.vyral-package-integrity', version:1, hash_algorithm:'SHA-256', coverage:'all package entries except manifest.json and system/system-files.json; integrity self-hash is omitted to avoid recursion', entries:covered.sort((a,b)=>a.path.localeCompare(b.path)) };
  const entries = Object.entries(payloads).map(([path,value])=>({path,data:json(value)}));
  entries.push({path:'system/system-files.json',data:json({schema:'vyra.vyral-system-file-index',version:1,files:descriptors,deletion_policy:{individual_system_file_deletion:'forbidden',delete_with_parent_vyral_only:true}})});
  return { descriptors, entries };
};
const PROTECTED_PATHS = new Set<string>([...SYSTEM_SOURCES.map(item=>item.path),'system/system-files.json']);
export const isVyralSystemFilePathV1 = (path: string): boolean => PROTECTED_PATHS.has(path) || path.startsWith('system/');
export const assertVyralPackageDeletionAllowedV1 = (path: string, deletingWholeVyral: boolean): void => { if (isVyralSystemFilePathV1(path) && !deletingWholeVyral) throw new Error('Protected Vyral System Files cannot be deleted individually.'); };

/** Structural validation is synchronous so existing package readers remain backward compatible. */
export const validateVyralSystemFilesStructureV1 = (
  files: Map<string, Uint8Array>,
  manifestValue: Record<string, unknown>,
): void => {
  const manifest = record(manifestValue);
  if (manifest.systemFiles === undefined) return; // Legacy package.
  if (!Array.isArray(manifest.systemFiles)) throw new Error('Vyral System File inventory is malformed.');
  const expectedDefinitions = [
    ...SYSTEM_SOURCES.map(item => ({ ...item, protected: true as const })),
    { path:'system/system-files.json', kind:'system_file_index', source:'package.systemFiles', required:true, protected:true as const },
  ];
  const expectedPaths = expectedDefinitions.map(item=>item.path);
  const descriptors = manifest.systemFiles as VyralSystemFileDescriptorV1[];
  const paths = descriptors.map(item=>item?.path);
  if (descriptors.length !== expectedPaths.length || new Set(paths).size !== paths.length ||
      expectedPaths.some(path=>!paths.includes(path))) throw new Error('Vyral System File inventory is incomplete or contains unexpected paths.');
  for (const expected of expectedDefinitions) {
    const item = descriptors.find(value=>value?.path===expected.path);
    if (!item || item.kind!==expected.kind || item.source!==expected.source ||
        item.protected!==true || item.required!==true ||
        !['present','empty','not_available'].includes(item.state)) {
      throw new Error('A required Vyral System File definition is invalid or not protected.');
    }
    if (!files.has(item.path)) throw new Error('A required Vyral System File is missing: ' + item.path);
  }
  for (const path of expectedPaths.filter(path=>path.startsWith('system/') && path!=='system/system-files.json')) {
    const bytes = files.get(path)!;
    try { JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)); }
    catch { throw new Error('Vyral System File is not valid UTF-8 JSON: ' + path); }
  }
  let index: Record<string, unknown>;
  try { index = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(files.get('system/system-files.json')!)) as Record<string, unknown>; }
  catch { throw new Error('Vyral System File index is not valid JSON.'); }
  if (!Array.isArray(index.files) || JSON.stringify(index.files)!==JSON.stringify(descriptors)) {
    throw new Error('Vyral System File index does not match the protected manifest inventory.');
  }
};

/** Verify the SHA-256 inventory for every non-manifest, non-System package entry. */
export const verifyVyralSystemFileIntegrityV1 = async (files: Map<string, Uint8Array>): Promise<void> => {
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new Error('Vyral package manifest is missing.');
  let manifest: Record<string, unknown>;
  try { manifest = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes)) as Record<string, unknown>; }
  catch { throw new Error('Vyral package manifest is invalid JSON.'); }
  if (manifest.systemFiles === undefined) return;
  validateVyralSystemFilesStructureV1(files, manifest);
  const integrityBytes = files.get('system/integrity.json');
  if (!integrityBytes) throw new Error('Vyral package integrity file is missing.');
  const integrity = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(integrityBytes)) as Record<string, unknown>;
  if (integrity.hash_algorithm !== 'SHA-256' || !Array.isArray(integrity.entries)) throw new Error('Vyral package integrity declaration is invalid.');
  const actualPaths = [...files.keys()].filter(path=>path!=='manifest.json'&&path!=='system/integrity.json'&&path!=='system/system-files.json').sort();
  const declared = (integrity.entries as Array<Record<string, unknown>>).slice().sort((a,b)=>String(a.path).localeCompare(String(b.path)));
  if (declared.length!==actualPaths.length || declared.some((entry,index)=>entry.path!==actualPaths[index])) {
    throw new Error('Vyral package integrity inventory does not match the actual package entries.');
  }
  for (const entry of declared) {
    const bytes=files.get(String(entry.path));
    if (!bytes || Number(entry.size_bytes)!==bytes.byteLength || String(entry.sha256)!==await digest(bytes)) {
      throw new Error('Vyral package SHA-256 verification failed: ' + String(entry.path));
    }
  }
};
