export type RgbRaster = { width: number; height: number; rgb: Uint8Array };

const round = (value: number) => Number(value.toFixed(6));

const sampleBilinear = (image: RgbRaster, u: number, v: number) => {
  const x = Math.max(0, Math.min(image.width - 1, u * image.width - 0.5));
  const y = Math.max(0, Math.min(image.height - 1, v * image.height - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(image.width - 1, x0 + 1), y1 = Math.min(image.height - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const result = [0, 0, 0];
  for (let channel = 0; channel < 3; channel++) {
    const p00 = image.rgb[(y0 * image.width + x0) * 3 + channel];
    const p10 = image.rgb[(y0 * image.width + x1) * 3 + channel];
    const p01 = image.rgb[(y1 * image.width + x0) * 3 + channel];
    const p11 = image.rgb[(y1 * image.width + x1) * 3 + channel];
    result[channel] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) +
      (p01 * (1 - fx) + p11 * fx) * fy;
  }
  return result;
};

const assertRaster = (image: RgbRaster) =>
  Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height) &&
  image.width > 0 && image.height > 0 && image.rgb.length === image.width * image.height * 3;

export const compareNormalizedRaster = (a: RgbRaster, b: RgbRaster) => {
  if (!assertRaster(a) || !assertRaster(b)) return { performed: false, reason: 'Invalid RGB raster input.', meanAbsoluteErrorPerChannel: null, rootMeanSquareErrorPerChannel: null, peakSignalToNoiseRatioDb: null, normalizedRgbSimilarity: null };
  const aspectA = a.width / a.height, aspectB = b.width / b.height;
  const aspectRatioDelta = Math.abs(aspectA - aspectB);
  if (aspectRatioDelta > 0.001) {
    return { performed: false, reason: 'Aspect ratios differ; normalized comparison is withheld rather than stretching or cropping either image.', aspectRatioDelta: round(aspectRatioDelta), meanAbsoluteErrorPerChannel: null, rootMeanSquareErrorPerChannel: null, peakSignalToNoiseRatioDb: null, normalizedRgbSimilarity: null };
  }
  const gridWidth = Math.max(1, Math.round(256 * Math.min(1, aspectA)));
  const gridHeight = Math.max(1, Math.round(256 / Math.max(1, aspectA)));
  let absoluteError = 0, squaredError = 0;
  const channelErrors = [0, 0, 0];
  const sampleCount = gridWidth * gridHeight;
  for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) {
    const u = (x + 0.5) / gridWidth, v = (y + 0.5) / gridHeight;
    const pa = sampleBilinear(a, u, v), pb = sampleBilinear(b, u, v);
    for (let c = 0; c < 3; c++) {
      const error = Math.abs(pa[c] - pb[c]);
      channelErrors[c] += error;
      absoluteError += error;
      squaredError += error * error;
    }
  }
  const channelSampleCount = sampleCount * 3;
  const mae = absoluteError / channelSampleCount;
  const rmse = Math.sqrt(squaredError / channelSampleCount);
  return {
    performed: true, gridWidth, gridHeight, sampleCount,
    meanAbsoluteErrorPerChannel: round(mae),
    rootMeanSquareErrorPerChannel: round(rmse),
    peakSignalToNoiseRatioDb: rmse === 0 ? null : round(20 * Math.log10(255 / rmse)),
    channelMeanAbsoluteError: channelErrors.map((value) => round(value / sampleCount)),
    normalizedRgbSimilarity: round(Math.max(0, 1 - mae / 255)),
    aspectRatioDelta: round(aspectRatioDelta),
    method: 'Bilinear RGB samples at corresponding normalized cell centers; dimensions may differ but aspect ratio must match. Reports MAE, RMSE and PSNR; not SSIM, perceptual identity or exact pixel equality.',
  };
};

export const compareRedMaskIoU = (a: RgbRaster, b: RgbRaster) => {
  if (!assertRaster(a) || !assertRaster(b)) return { performed: false, reason: 'Invalid RGB raster input.', intersectionOverUnion: null };
  const aspectA = a.width / a.height, aspectB = b.width / b.height;
  const aspectRatioDelta = Math.abs(aspectA - aspectB);
  if (aspectRatioDelta > 0.001) return { performed: false, reason: 'Aspect ratios differ; normalized mask comparison is withheld.', aspectRatioDelta: round(aspectRatioDelta), intersectionOverUnion: null };
  const gridWidth = Math.max(1, Math.round(256 * Math.min(1, aspectA)));
  const gridHeight = Math.max(1, Math.round(256 / Math.max(1, aspectA)));
  let aCount = 0, bCount = 0, intersection = 0;
  for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) {
    const u = (x + 0.5) / gridWidth, v = (y + 0.5) / gridHeight;
    const pa = sampleBilinear(a, u, v), pb = sampleBilinear(b, u, v);
    const redA = pa[0] >= 120 && pa[0] > pa[1] * 1.35 && pa[0] > pa[2] * 1.35;
    const redB = pb[0] >= 120 && pb[0] > pb[1] * 1.35 && pb[0] > pb[2] * 1.35;
    if (redA) aCount++;
    if (redB) bCount++;
    if (redA && redB) intersection++;
  }
  const union = aCount + bCount - intersection;
  return {
    performed: true, gridWidth, gridHeight, sourceRedMaskPixels: aCount,
    candidateRedMaskPixels: bCount, intersectionPixels: intersection, unionPixels: union,
    intersectionOverUnion: union === 0 ? null : round(intersection / union),
    method: 'Intersection-over-union of red-dominant masks sampled on a common normalized grid using the existing red threshold; ORIGIN-01-specific diagnostic, not a general semantic metric.',
  };
};
