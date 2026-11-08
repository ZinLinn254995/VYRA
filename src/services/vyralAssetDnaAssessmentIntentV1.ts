const ASSET_DNA_REFERENCE = /(?:asset\s*dna|dna\s*of\s*(?:this\s*)?asset|asset\s*identity\s*dna|asset\s*reconstruction\s*dna|asset\s*ဒီအန်အေ|asset\s*dna)/i;
const ASSET_DNA_QUALITY_INTENT = /(?:quality|grade|grading|evaluate|evaluation|assess|assessment|readiness|reconstruct|reconstruction|verify|verification|အရည်အသွေး|အဆင့်|အကဲဖြတ်|စစ်ဆေး|စစ်ပေး|ပြန်တည်ဆောက်|ပြန်လည်တည်ဆောက်)/i;

/** Recognize explicit Asset DNA assessment requests in English and Burmese. */
export const requestsVyralAssetDnaAssessmentV1 = (value: string): boolean => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return ASSET_DNA_REFERENCE.test(value) && ASSET_DNA_QUALITY_INTENT.test(value);
};
