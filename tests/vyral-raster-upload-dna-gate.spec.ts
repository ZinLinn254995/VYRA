import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ingestion = readFileSync(new URL('../src/services/vyralAssetIngestion.ts', import.meta.url), 'utf8');
const creator = readFileSync(new URL('../src/components/profile/VyralDetailsContent.tsx', import.meta.url), 'utf8');
const rasterStart = ingestion.indexOf('if (rasterDna)');
const rasterEnd = ingestion.indexOf('await port.markReady', rasterStart);
assert.notEqual(rasterStart, -1, 'shared Asset ingestion must branch on raster DNA requirements');
assert.notEqual(rasterEnd, -1, 'Asset ready transition must remain after DNA extraction');
const rasterFlow = ingestion.slice(rasterStart, rasterEnd);

test('raster uploads cannot become ready with identity-only File DNA when DNA v3 extraction fails', () => {
  assert.match(rasterFlow, /port\.extractRasterDna\(assetId, versionId, input\.signal\)/);
  assert.match(rasterFlow, /extraction\.status !== 'extracted'/);
  assert.match(rasterFlow, /Required raster DNA v3 extraction failed/);
  assert.match(rasterFlow, /dnaCommitted = true/);
  assert.match(creator, /ingestVyralAsset\(createSupabaseVyralAssetIngestionPort/);
});

test('identity-only File DNA remains limited to non-raster uploads', () => {
  assert.match(rasterFlow, /\} else \{\s*const fileDna = await createVyralFileDnaV1/);
  assert.ok(rasterEnd > rasterStart);
});
