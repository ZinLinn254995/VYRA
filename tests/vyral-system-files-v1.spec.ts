import test from 'node:test';
import assert from 'node:assert/strict';
import { assertVyralPackageDeletionAllowedV1, buildVyralSystemFilesV1, isVyralSystemFilePathV1, validateVyralSystemFilesStructureV1, verifyVyralSystemFileIntegrityV1 } from '../src/services/vyralSystemFilesV1.ts';
import { createVyralZip, parseVyralManifest, readVyralZip, selectVyralPackageComponents, VYRAL_PACKAGE_FORMAT } from '../src/services/vyralPackage.ts';
const manifest = {
  format:'application/vnd.vyra.vyral+zip', formatVersion:1, packageId:'package-1',
  vyral:{id:'vyral-1',name:'ORIGIN-01',license_policy:{allow_ai_analysis:true}},
  assets:[{id:'asset-1',name:'Red Circle',asset_type:'image',mime_type:'image/png'}],
  versions:[{id:'version-1',asset_id:'asset-1',package_path:'assets/asset-1/source.png'}],
  dnaRecords:[{id:'dna-1',asset_id:'asset-1',scope:'asset',payload:{dna_schema_id:'vyra.asset-dna',dna_schema_version:3}}],
  fingerprints:[{id:'fp-1',asset_id:'asset-1',fingerprint_kind:'sha256',algorithm:'SHA-256',value:'a'.repeat(64)}],
  visionObservations:[],lineage:[],reconstructionTests:[],
  masterDna:{master_dna_id:'master-1',snapshot:{revision:1},relationships:[],integrity:{manifest_sha256:'b'.repeat(64)}},
};
test('builds protected System File projections without duplicating canonical DNA payloads',async()=>{
 const result=await buildVyralSystemFilesV1(manifest,[{path:'assets/asset-1/source.png',data:new Uint8Array([1,2,3])}]);
 assert.equal(result.descriptors.length,13); assert.ok(result.descriptors.every(x=>x.required&&x.protected));
 const files=new Map(result.entries.map(x=>[x.path,x.data]));
 for(const path of ['system/identity.json','system/asset-index.json','system/asset-dna/index.json','system/master-dna.ref.json','system/integrity.json','system/system-files.json']) assert.ok(files.has(path));
 const dna=JSON.parse(files.get('system/asset-dna/index.json')!); assert.deepEqual(dna.records.map(x=>x.record_id),['dna-1']); assert.equal(files.has('system/asset-dna/dna-1.json'),false);
 assert.match(JSON.parse(files.get('system/master-dna.ref.json')!).note,/stored once/);
 assert.equal(JSON.parse(files.get('system/integrity.json')!).entries[0].sha256.length,64);
});
test('marks missing records honestly',async()=>{
 const result=await buildVyralSystemFilesV1({...manifest,masterDna:null,dnaRecords:[],fingerprints:[],lineage:[]});
 const states=new Map(result.descriptors.map(x=>[x.path,x.state]));
 assert.equal(states.get('system/master-dna.ref.json'),'not_available'); assert.equal(states.get('system/asset-dna/index.json'),'empty'); assert.equal(states.get('system/fingerprints/index.json'),'empty');
});
test('prevents individual System File deletion',()=>{
 assert.equal(isVyralSystemFilePathV1('system/licensing.json'),true); assert.equal(isVyralSystemFilePathV1('manifest.json'),true); assert.equal(isVyralSystemFilePathV1('assets/a/original.png'),false);
 assert.throws(()=>assertVyralPackageDeletionAllowedV1('system/master-dna.ref.json',false),/cannot be deleted individually/);
 assert.throws(()=>assertVyralPackageDeletionAllowedV1('manifest.json',false),/cannot be deleted individually/);
 assert.doesNotThrow(()=>assertVyralPackageDeletionAllowedV1('system/master-dna.ref.json',true)); assert.doesNotThrow(()=>assertVyralPackageDeletionAllowedV1('assets/a/original.png',false));
});
test('rejects invalid package manifests',async()=>{await assert.rejects(()=>buildVyralSystemFilesV1({...manifest,assets:'invalid'}),/invalid package manifest/);});

test('validates the required System File inventory and detects package tampering',async()=>{
 const built=await buildVyralSystemFilesV1(manifest,[{path:'assets/asset-1/source.png',data:new Uint8Array([1,2,3])}]);
 const entries=[{path:'assets/asset-1/source.png',data:new Uint8Array([1,2,3])},...built.entries];
 const projected={...manifest,systemFiles:built.descriptors};
 const manifestBytes=new TextEncoder().encode(JSON.stringify(projected));
 const map=new Map<string,Uint8Array>([['manifest.json',manifestBytes],...entries.map(e=>[e.path,new TextEncoder().encode(e.data)] as [string,Uint8Array])]);
 validateVyralSystemFilesStructureV1(map,projected);
 await verifyVyralSystemFileIntegrityV1(map);
 map.set('assets/asset-1/source.png',new Uint8Array([9,9,9]));
 await assert.rejects(()=>verifyVyralSystemFileIntegrityV1(map),/SHA-256 verification failed/);
});

test('component-selected .vyral exports include protected System Files and pass import validation',async()=>{
 const base={
  format:VYRAL_PACKAGE_FORMAT,formatVersion:1,packageId:'system-export-test',exportedAt:'2026-11-09T00:00:00.000Z',
  vyral:{id:'vyral-export-test',name:'System File Export Test'},folders:[],assets:[],versions:[],
  dnaRecords:[],fingerprints:[],visionObservations:[],lineage:[],reconstructionTests:[],masterDna:null,
 };
 const source=createVyralZip([{path:'README.txt',data:'test package'},{path:'manifest.json',data:JSON.stringify(base)}]);
 const output=await selectVyralPackageComponents(source,{assets:true,fullDna:false,compactDna:false});
 const files=await readVyralZip(output);
 const parsed=parseVyralManifest(files);
 assert.equal(parsed.systemFiles?.length,13);
 assert.ok(files.has('system/system-files.json'));
 assert.ok(files.has('system/identity.json'));
 assert.ok(files.has('system/integrity.json'));
 await verifyVyralSystemFileIntegrityV1(files);
});
