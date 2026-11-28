/**
 * Локальное шумоподавление микрофона для web и Windows (Electron): нейросеть RNNoise (WASM, AudioWorklet).
 * Работает целиком на устройстве, без облака и лицензий. Krisp — проприетарный и в самохостинговом LiveKit недоступен.
 * Воркле собирается из @timephy/rnnoise-wasm в public/rnnoise-worklet.js.
 */
import type { TrackProcessor, Track } from 'livekit-client';

export function createNoiseProcessor(): TrackProcessor<Track.Kind.Audio> | null {
  if (typeof window === 'undefined' || typeof AudioWorkletNode === 'undefined') return null;
  // RNNoise отключён по умолчанию: после его добавления пропадал звук в обе стороны (AudioContext мог оставаться
  // в suspended и отдавать тишину). Базовое шумоподавление браузера/WebRTC (noiseSuppression) работает всегда.
  // Включение для проверки: localStorage.setItem('sg:rnnoise', '1').
  try {
    if (window.localStorage.getItem('sg:rnnoise') !== '1') return null;
  } catch {
    return null;
  }
  let ctx: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let dest: MediaStreamAudioDestinationNode | null = null;
  const processor = {
    name: 'rnnoise',
    processedTrack: undefined as MediaStreamTrack | undefined,
    async init(opts: { track: MediaStreamTrack }) {
      // RNNoise работает на 48 кГц.
      ctx = new AudioContext({ sampleRate: 48000 });
      await ctx.resume().catch(() => undefined);
      await ctx.audioWorklet.addModule('/rnnoise-worklet.js');
      source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
      node = new AudioWorkletNode(ctx, 'NoiseSuppressorWorklet');
      dest = ctx.createMediaStreamDestination();
      source.connect(node).connect(dest);
      processor.processedTrack = dest.stream.getAudioTracks()[0];
    },
    async restart(opts: { track: MediaStreamTrack }) {
      await processor.destroy();
      await processor.init(opts);
    },
    async destroy() {
      try { source?.disconnect(); node?.disconnect(); } catch { /* уже отключено */ }
      try { await ctx?.close(); } catch { /* уже закрыт */ }
      ctx = null; node = null; source = null; dest = null;
      processor.processedTrack = undefined;
    },
  };
  return processor as unknown as TrackProcessor<Track.Kind.Audio>;
}
