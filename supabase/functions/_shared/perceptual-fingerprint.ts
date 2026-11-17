export const VYRAL_DHASH_ALGORITHM = 'dHash-64-v1' as const;

export const computeVyralDHash64 = (samples: Uint8Array, width: number, height: number, channels: 3 | 4): string => {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      (channels !== 3 && channels !== 4) || samples.byteLength !== width * height * channels) {
    throw new Error('Perceptual fingerprint input dimensions or channel layout are invalid.');
  }
  const luminance = (x: number, y: number) => {
    const offset = (y * width + x) * channels;
    const alpha = channels === 4 ? samples[offset + 3] / 255 : 1;
    const red = samples[offset] * alpha + 255 * (1 - alpha);
    const green = samples[offset + 1] * alpha + 255 * (1 - alpha);
    const blue = samples[offset + 2] * alpha + 255 * (1 - alpha);
    return red * 0.299 + green * 0.587 + blue * 0.114;
  };
  let bits = 0n;
  for (let row = 0; row < 8; row++) {
    const y = Math.min(height - 1, Math.floor((row + 0.5) * height / 8));
    for (let column = 0; column < 8; column++) {
      const leftX = Math.min(width - 1, Math.floor((column + 0.5) * width / 9));
      const rightX = Math.min(width - 1, Math.floor((column + 1.5) * width / 9));
      bits = (bits << 1n) | (luminance(leftX, y) > luminance(rightX, y) ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, '0');
};

export const compareVyralDHash64 = (left: string, right: string): { hammingDistance: number; similarity: number } | null => {
  if (!/^[a-f0-9]{16}$/i.test(left) || !/^[a-f0-9]{16}$/i.test(right)) return null;
  let difference = BigInt('0x' + left) ^ BigInt('0x' + right);
  let hammingDistance = 0;
  while (difference) {
    hammingDistance += Number(difference & 1n);
    difference >>= 1n;
  }
  return { hammingDistance, similarity: (64 - hammingDistance) / 64 };
};
