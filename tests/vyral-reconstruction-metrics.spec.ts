import test from 'node:test';
import assert from 'node:assert/strict';
import { compareNormalizedRaster, compareRedMaskIoU } from '../supabase/functions/_shared/reconstruction-metrics.ts';

const solid = (width: number, height: number, color: [number, number, number]) => {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) rgb.set(color, i * 3);
  return { width, height, rgb };
};

const redCircle = (width: number, height: number, shiftX = 0) => {
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = (x + 0.5 - width / 2 - shiftX) / width;
    const dy = (y + 0.5 - height / 2) / height;
    rgb.set(dx * dx + dy * dy < 0.16 ? [220, 20, 30] : [254, 253, 254], (y * width + x) * 3);
  }
  return { width, height, rgb };
};

test('normalized RGB comparison handles different resolutions without stretching', () => {
  const a = solid(64, 64, [254, 253, 254]);
  const b = solid(128, 128, [254, 253, 254]);
  const result = compareNormalizedRaster(a, b);
  assert.equal(result.performed, true);
  assert.equal(result.meanAbsoluteErrorPerChannel, 0);
  assert.equal(result.rootMeanSquareErrorPerChannel, 0);
  assert.equal(result.normalizedRgbSimilarity, 1);
});

test('normalized RGB comparison withholds mismatched aspect ratios', () => {
  const result = compareNormalizedRaster(solid(64, 64, [255, 255, 255]), solid(80, 64, [255, 255, 255]));
  assert.equal(result.performed, false);
});

test('PSNR is reported as undefined infinity for a perfect normalized match', () => {
  const result = compareNormalizedRaster(solid(32, 32, [10, 20, 30]), solid(64, 64, [10, 20, 30]));
  assert.equal(result.peakSignalToNoiseRatioDb, null);
});

test('red mask IoU is 1 for identical geometry across resolutions', () => {
  const result = compareRedMaskIoU(redCircle(128, 128), redCircle(256, 256));
  assert.equal(result.performed, true);
  assert.ok((result.intersectionOverUnion ?? 0) > 0.98);
});

test('red mask IoU decreases when the candidate shape is shifted', () => {
  const result = compareRedMaskIoU(redCircle(128, 128), redCircle(128, 128, 12));
  assert.equal(result.performed, true);
  assert.ok((result.intersectionOverUnion ?? 1) < 1);
});
