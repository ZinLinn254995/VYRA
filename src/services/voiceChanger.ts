export type VoiceChangerPresetId =
  | 'clean'
  | 'studio'
  | 'radio'
  | 'telephone'
  | 'robot'
  | 'alien'
  | 'deep'
  | 'bright'
  | 'vintage'
  | 'custom';

export type VoiceChangerSettings = {
  presetId: VoiceChangerPresetId;
  enabled: boolean;
  tone: number;
  robot: number;
  distortion: number;
  echo: number;
  warmth: number;
};

export const DEFAULT_VOICE_CHANGER_SETTINGS: VoiceChangerSettings = {
  presetId: 'clean',
  enabled: false,
  tone: 0,
  robot: 0,
  distortion: 0,
  echo: 0,
  warmth: 0,
};

export const VOICE_CHANGER_PRESETS: ReadonlyArray<{
  id: VoiceChangerPresetId;
  label: string;
  description: string;
  settings: Omit<VoiceChangerSettings, 'presetId' | 'enabled'>;
}> = [
  { id: 'clean', label: 'Original', description: 'Keep the source voice natural', settings: { tone: 0, robot: 0, distortion: 0, echo: 0, warmth: 0 } },
  { id: 'studio', label: 'Studio', description: 'Clear, balanced and warm', settings: { tone: 0.15, robot: 0, distortion: 0, echo: 0, warmth: 0.25 } },
  { id: 'radio', label: 'Radio', description: 'Narrow-band broadcast character', settings: { tone: -0.35, robot: 0, distortion: 0.12, echo: 0, warmth: -0.15 } },
  { id: 'telephone', label: 'Telephone', description: 'Classic telephone bandwidth', settings: { tone: -0.55, robot: 0, distortion: 0.05, echo: 0, warmth: -0.25 } },
  { id: 'robot', label: 'Robot', description: 'Mechanical modulation', settings: { tone: -0.1, robot: 0.85, distortion: 0.18, echo: 0.04, warmth: 0 } },
  { id: 'alien', label: 'Alien', description: 'Synthetic, modulated texture', settings: { tone: 0.35, robot: 0.65, distortion: 0.3, echo: 0.18, warmth: -0.1 } },
  { id: 'deep', label: 'Deep', description: 'Darker, heavier vocal tone', settings: { tone: -0.4, robot: 0, distortion: 0.04, echo: 0, warmth: 0.55 } },
  { id: 'bright', label: 'Bright', description: 'Lighter, more present vocal tone', settings: { tone: 0.55, robot: 0, distortion: 0, echo: 0, warmth: -0.15 } },
  { id: 'vintage', label: 'Vintage', description: 'Soft saturation and old-record texture', settings: { tone: -0.2, robot: 0.08, distortion: 0.28, echo: 0.08, warmth: 0.35 } },
];

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  Math.max(min, Math.min(max, typeof value === 'number' && Number.isFinite(value) ? value : fallback));

export function normalizeVoiceChangerSettings(input?: Partial<VoiceChangerSettings> | null): VoiceChangerSettings {
  const presetId = VOICE_CHANGER_PRESETS.some((preset) => preset.id === input?.presetId)
    ? input!.presetId as VoiceChangerPresetId
    : input?.presetId === 'custom' ? 'custom' : 'clean';
  return {
    presetId,
    enabled: input?.enabled === true,
    tone: clamp(input?.tone, -1, 1, 0),
    robot: clamp(input?.robot, 0, 1, 0),
    distortion: clamp(input?.distortion, 0, 1, 0),
    echo: clamp(input?.echo, 0, 1, 0),
    warmth: clamp(input?.warmth, -1, 1, 0),
  };
}

export function createVoiceChangerPreset(presetId: VoiceChangerPresetId): VoiceChangerSettings {
  const preset = VOICE_CHANGER_PRESETS.find((item) => item.id === presetId) ?? VOICE_CHANGER_PRESETS[0];
  return normalizeVoiceChangerSettings({ presetId, enabled: presetId !== 'clean', ...preset.settings });
}

export function createVoiceChangerDistortionCurve(amount: number, sampleCount = 256): Float32Array {
  const normalized = clamp(amount, 0, 1, 0);
  const samples = Math.max(32, Math.min(4096, Math.floor(sampleCount)));
  const curve = new Float32Array(samples);
  const drive = 1 + normalized * 18;
  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / (samples - 1) - 1;
    curve[index] = Math.tanh(x * drive) / Math.tanh(drive);
  }
  return curve;
}
