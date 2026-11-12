import test from 'node:test';
import assert from 'node:assert/strict';
import { computeVyralDHash64, compareVyralDHash64 } from '../supabase/functions/_shared/perceptual-fingerprint.ts';

const gradient = (width: number, height: number, scale = 1) => {
  const samples = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const sourceX = Math.floor(x / scale);
      const value = 255 - sourceX * 20;
      samples[offset] = value;
      samples[offset + 1] = value;
      samples[offset + 2] = value;
      samples[offset + 3] = 255;
    }
  }
  return samples;
};

test('dHash is deterministic and normalized across nearest-neighbour resize', () => {
  const original = computeVyralDHash64(gradient(9, 8), 9, 8, 4);
  const resized = computeVyralDHash64(gradient(18, 16, 2), 18, 16, 4);
  assert.equal(original, 'ffffffffffffffff');
  assert.equal(resized, original);
});

test('dHash compares visual structure using a bounded 64-bit Hamming similarity', () => {
  const same = compareVyralDHash64('0123456789abcdef', '0123456789abcdef');
  assert.deepEqual(same, { hammingDistance: 0, similarity: 1 });
  const oneBit = compareVyralDHash64('0000000000000000', '0000000000000001');
  assert.deepEqual(oneBit, { hammingDistance: 1, similarity: 63 / 64 });
  assert.equal(compareVyralDHash64('invalid', '0000000000000000'), null);
});

test('transparent pixels are composited on white before visual fingerprinting', () => {
  const transparent = new Uint8Array(9 * 8 * 4);
  const opaqueWhite = new Uint8Array(9 * 8 * 4);
  for (let index = 0; index < 9 * 8; index++) {
    transparent.set([0, 0, 0, 0], index * 4);
    opaqueWhite.set([255, 255, 255, 255], index * 4);
  }
  assert.equal(computeVyralDHash64(transparent, 9, 8, 4), computeVyralDHash64(opaqueWhite, 9, 8, 4));
});
