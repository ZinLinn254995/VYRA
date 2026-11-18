import type { ProjectRenderAudioLayer, ProjectRenderCompositionPlan } from './projectRenderCompositionPlanner';
import { getProjectRenderSourceKey } from './projectRenderManifest';

export type ProjectRenderDecodedAudio = {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  getChannelData(channel: number): Float32Array;
};

export type ProjectRenderMixedAudio = {
  sampleRate: number;
  numberOfChannels: number;
  length: number;
  durationSeconds: number;
  channels: Float32Array[];
  peak: number;
};

function validateBuffer(buffer: ProjectRenderDecodedAudio): void {
  if (!buffer || !Number.isSafeInteger(buffer.sampleRate) || buffer.sampleRate <= 0 ||
      !Number.isSafeInteger(buffer.numberOfChannels) || buffer.numberOfChannels < 1 ||
      !Number.isSafeInteger(buffer.length) || buffer.length < 1) {
    throw new Error('A decoded audio source must have a valid sample rate, channel count, and sample length.');
  }
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    if (!(data instanceof Float32Array) || data.length !== buffer.length) {
      throw new Error('A decoded audio source contains an invalid channel buffer.');
    }
  }
}

function sampleLinear(data: Float32Array, position: number): number {
  const left = Math.floor(position);
  const fraction = position - left;
  const a = data[Math.min(left, data.length - 1)] ?? 0;
  const b = data[Math.min(left + 1, data.length - 1)] ?? a;
  return a + (b - a) * fraction;
}

function sampleSource(buffer: ProjectRenderDecodedAudio, outputChannel: number, outputChannels: number, position: number): number {
  if (outputChannels === 1 && buffer.numberOfChannels > 1) {
    let sum = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      sum += sampleLinear(buffer.getChannelData(channel), position);
    }
    return sum / buffer.numberOfChannels;
  }
  const sourceChannel = buffer.numberOfChannels === 1 ? 0 : Math.min(outputChannel, buffer.numberOfChannels - 1);
  return sampleLinear(buffer.getChannelData(sourceChannel), position);
}

/**
 * Mix already-decoded, immutable audio sources against the pinned Project plan.
 * Samples are linearly resampled to the output rate; summing is intentionally
 * unclipped so a later mastering/limiter stage can make the final loudness choice.
 */
export function mixProjectRenderAudio(input: {
  plan: ProjectRenderCompositionPlan;
  sources: ReadonlyMap<string, ProjectRenderDecodedAudio>;
  sampleRate: number;
  numberOfChannels?: number;
  signal?: AbortSignal;
}): ProjectRenderMixedAudio {
  const { plan, sources, sampleRate, signal } = input;
  const numberOfChannels = input.numberOfChannels ?? 2;
  if (!plan || plan.schema !== 'vyra.project-render-composition-plan' || plan.version !== 1) {
    throw new Error('A supported immutable Project render composition plan is required.');
  }
  if (!Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      !Number.isSafeInteger(numberOfChannels) || numberOfChannels < 1 || numberOfChannels > 8) {
    throw new Error('Audio output must use a sample rate from 8 kHz to 192 kHz and one to eight channels.');
  }
  if (signal?.aborted) throw signal.reason ?? new DOMException('Audio render aborted.', 'AbortError');

  const length = Math.ceil(plan.durationSeconds * sampleRate);
  if (!Number.isSafeInteger(length) || length < 1) throw new Error('The Project render duration cannot produce a valid audio buffer.');
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  const buffers = new Map<string, ProjectRenderDecodedAudio>();
  const layers: ProjectRenderAudioLayer[] = [...plan.audio].sort((a, b) =>
    a.startSeconds - b.startSeconds || a.layer - b.layer || a.trackId.localeCompare(b.trackId) || a.clipId.localeCompare(b.clipId));

  for (const layer of layers) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Audio render aborted.', 'AbortError');
    if (!Number.isFinite(layer.startSeconds) || !Number.isFinite(layer.endSeconds) ||
        !Number.isFinite(layer.sourceInSeconds) || !Number.isFinite(layer.sourceOutSeconds) ||
        layer.startSeconds < 0 || layer.endSeconds <= layer.startSeconds ||
        layer.sourceInSeconds < 0 || layer.sourceOutSeconds <= layer.sourceInSeconds ||
        !Number.isFinite(layer.gain) || layer.gain < 0) {
      throw new Error('The Project audio plan contains an invalid clip range or gain.');
    }
    const key = getProjectRenderSourceKey(layer.source);
    let buffer = buffers.get(key);
    if (!buffer) {
      buffer = sources.get(key);
      if (!buffer) throw new Error('A decoded audio source required by the Project plan is missing.');
      validateBuffer(buffer);
      buffers.set(key, buffer);
    }
    const outputStart = Math.max(0, Math.floor(layer.startSeconds * sampleRate));
    const outputEnd = Math.min(length, Math.ceil(layer.endSeconds * sampleRate));
    const sourceStart = layer.sourceInSeconds * buffer.sampleRate;
    const maxSourcePosition = Math.min(buffer.length, layer.sourceOutSeconds * buffer.sampleRate);
    for (let frame = outputStart; frame < outputEnd; frame += 1) {
      if ((frame & 0x3fff) === 0 && signal?.aborted) {
        throw signal.reason ?? new DOMException('Audio render aborted.', 'AbortError');
      }
      const position = sourceStart + (frame / sampleRate - layer.startSeconds) * buffer.sampleRate;
      if (position < 0 || position >= maxSourcePosition || position >= buffer.length) continue;
      for (let channel = 0; channel < numberOfChannels; channel += 1) {
        channels[channel][frame] += sampleSource(buffer, channel, numberOfChannels, position) * layer.gain;
      }
    }
  }

  let peak = 0;
  for (const channel of channels) {
    for (let frame = 0; frame < channel.length; frame += 1) peak = Math.max(peak, Math.abs(channel[frame]));
  }
  return { sampleRate, numberOfChannels, length, durationSeconds: length / sampleRate, channels, peak };
}
