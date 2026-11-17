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


export type VoiceChangerGraph = { disconnect: () => void };

/** Build a real-time Web Audio voice-colour chain. Source timing and duration remain unchanged. */
export function connectVoiceChangerGraph(
  context: AudioContext,
  source: AudioNode,
  destination: AudioNode,
  input?: Partial<VoiceChangerSettings> | null,
  startAt = context.currentTime,
): VoiceChangerGraph {
  const settings = normalizeVoiceChangerSettings(input);
  if (!settings.enabled) {
    source.connect(destination);
    return { disconnect: () => { try { source.disconnect(destination); } catch { /* already disconnected */ } } };
  }

  const nodes: AudioNode[] = [];
  const highpass = context.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 70 + Math.max(0, -settings.tone) * 430;
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 18000 - Math.max(0, -settings.tone) * 14500;
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowshelf';
  warmth.frequency.value = 220;
  warmth.gain.value = settings.warmth * 12;
  const presence = context.createBiquadFilter();
  presence.type = 'highshelf';
  presence.frequency.value = 2800;
  presence.gain.value = settings.tone * 9;
  const shaper = context.createWaveShaper();
  shaper.curve = createVoiceChangerDistortionCurve(settings.distortion);
  shaper.oversample = '2x';
  const output = context.createGain();
  output.gain.value = 1;

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(warmth);
  warmth.connect(presence);
  presence.connect(shaper);
  shaper.connect(output);
  output.connect(destination);
  nodes.push(highpass, lowpass, warmth, presence, shaper, output);

  let oscillator: OscillatorNode | null = null;
  let biasSource: ConstantSourceNode | null = null;
  if (settings.robot > 0) {
    const depth = context.createGain();
    depth.gain.value = settings.robot * 0.42;
    output.gain.value = 0;
    const carrier = context.createOscillator();
    carrier.type = 'square';
    carrier.frequency.value = 34 + settings.robot * 92;
    const bias = context.createConstantSource();
    bias.offset.value = 1 - depth.gain.value;
    biasSource = bias;
    carrier.connect(depth);
    depth.connect(output.gain);
    bias.connect(output.gain);
    carrier.start(startAt);
    bias.start(startAt);
    oscillator = carrier;
    nodes.push(depth, carrier, bias);
  }

  let delay: DelayNode | null = null;
  let delaySend: GainNode | null = null;
  if (settings.echo > 0) {
    delay = context.createDelay(0.8);
    delay.delayTime.value = 0.08 + settings.echo * 0.32;
    delaySend = context.createGain();
    delaySend.gain.value = settings.echo * 0.42;
    output.connect(delay);
    delay.connect(delaySend);
    delaySend.connect(destination);
    nodes.push(delay, delaySend);
  }

  return {
    disconnect: () => {
      try { oscillator?.stop(); } catch { /* already stopped */ }
      try { biasSource?.stop(); } catch { /* already stopped */ }
      try { source.disconnect(highpass); } catch { /* already disconnected */ }
      for (const node of nodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
    },
  };
}
