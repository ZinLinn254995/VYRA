const VYRAL_REFERENCE = /(?:\bvyral\b|ဗိုင်ရယ်|ဗိုင်းရယ်)/i;
const HISTORY_INTENT = /(?:history|previous|prior|past|records?|results?|trend|compare|မှတ်တမ်း|မှတ်တမ်းတွေ|အရင်|ယခင်|ပြီးခဲ့တဲ့|နှိုင်းယှဉ်)/i;

/** Recognize explicit English and Burmese requests for a Vyral's saved quality history. */
export const requestsVyralQualityHistoryV1 = (value: string): boolean => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return VYRAL_REFERENCE.test(value) && HISTORY_INTENT.test(value);
};
