const VYRAL_REFERENCE = /(?:\bvyral\b|ဗိုင်ရယ်|ဗိုင်းရယ်)/i;
const QUALITY_INTENT = /(?:quality|grade|grading|evaluate|evaluation|assess|assessment|check|အရည်အသွေး|အဆင့်|အကဲဖြတ်|စစ်ဆေး|စစ်ပေး|အဆင့်သတ်မှတ်)/i;

/** Recognize explicit English and Burmese requests to evaluate a Vyral. */
export const requestsVyralQualityEvaluationV1 = (value: string): boolean => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return VYRAL_REFERENCE.test(value) && QUALITY_INTENT.test(value);
};
