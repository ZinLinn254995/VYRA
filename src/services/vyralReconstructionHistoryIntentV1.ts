const VYRAL_RECONSTRUCTION_REFERENCE = /(?:\bvyral\b|\borigin[- ]?01\b|ဗိုင်ရယ်|ဗိုင်းရယ်)/i;
const RECONSTRUCTION_HISTORY_INTENT = /(?:reconstruction|reconstruct(?:ion)?|blind\s*(?:test|attempt)|attempts?|comparison|compare|verification\s*history|test\s*results?|မှတ်တမ်း|နှိုင်းယှဉ်|စမ်းသပ်မှု|ပြန်လည်တည်ဆောက်)/i;

/** Recognize explicit requests to inspect saved DNA-only reconstruction attempts. */
export const requestsVyralReconstructionHistoryV1 = (value: string): boolean => {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  return VYRAL_RECONSTRUCTION_REFERENCE.test(value) && RECONSTRUCTION_HISTORY_INTENT.test(value);
};
