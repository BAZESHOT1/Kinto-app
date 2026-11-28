/**
 * Обработка голоса микрофона для web и Windows (Electron) — лёгкая студийная цепочка WebAudio на устройстве:
 *   фильтр верхних частот 90 Гц (убирает гул и «бубнение» корпуса) → срез «бочки» 220 Гц (−2.5 дБ) →
 *   присутствие 3 кГц (+2 дБ) и «воздух» 8 кГц (+1.5 дБ, объём/разборчивость) → мягкий компрессор (ровная громкость
 *   вместо AGC) → ограничитель. Оцифровка 48 кГц, полный диапазон (Opus fullband).
 * Нейросеть RNNoise (WASM) подключается в начало цепочки только по флагу localStorage 'sg:rnnoise' = '1'.
 * Если WebAudio недоступен или инициализация упала — звонок идёт без обработки.
 */
import type { TrackProcessor, Track } from 'livekit-client';
import { getAudioPrefs, useAudioPrefs } from './audioPrefs';

export function createNoiseProcessor(): TrackProcessor<Track.Kind.Audio> | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  const prefs0 = getAudioPrefs();
  // Цепочка выключена в настройках, а усиление не нужно — звук идёт как есть.
  if (!prefs0.voiceChain && prefs0.micGain === 1) return null;
  let rnnoise = false;
  try {
    rnnoise = window.localStorage.getItem('sg:rnnoise') === '1' && typeof AudioWorkletNode !== 'undefined';
  } catch {
    rnnoise = false;
  }
  let ctx: AudioContext | null = null;
  let nodes: AudioNode[] = [];
  let source: MediaStreamAudioSourceNode | null = null;
  let unsubscribe: (() => void) | null = null;
  const processor = {
    name: 'kinto-voice',
    processedTrack: undefined as MediaStreamTrack | undefined,
    async init(opts: { track: MediaStreamTrack }) {
      ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
      await ctx.resume().catch(() => undefined);
      source = ctx.createMediaStreamSource(new MediaStream([opts.track]));
      const chain: AudioNode[] = [];
      if (rnnoise) {
        await ctx.audioWorklet.addModule('/rnnoise-worklet.js');
        chain.push(new AudioWorkletNode(ctx, 'NoiseSuppressorWorklet'));
      }
      const voice = getAudioPrefs().voiceChain;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 90; hp.Q.value = 0.707;
      const boom = ctx.createBiquadFilter();
      boom.type = 'peaking'; boom.frequency.value = 220; boom.Q.value = 0.9; boom.gain.value = -2.5;
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking'; presence.frequency.value = 3000; presence.Q.value = 0.8; presence.gain.value = 2;
      const air = ctx.createBiquadFilter();
      air.type = 'highshelf'; air.frequency.value = 8000; air.gain.value = 1.5;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -26; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.16;
      const makeup = ctx.createGain();
      const baseGain = voice ? 1.6 : 1; // ≈ +4 дБ после компрессии (AGC выключен)
      makeup.gain.value = baseGain * getAudioPrefs().micGain;
      unsubscribe = useAudioPrefs.subscribe((st) => { makeup.gain.value = baseGain * st.micGain; });
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -3; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.08;
      if (voice) chain.push(hp, boom, presence, air, comp);
      chain.push(makeup);
      if (voice) chain.push(limiter);
      const dest = ctx.createMediaStreamDestination();
      let prev: AudioNode = source;
      for (const n of chain) { prev.connect(n); prev = n; }
      prev.connect(dest);
      nodes = chain;
      processor.processedTrack = dest.stream.getAudioTracks()[0];
    },
    async restart(opts: { track: MediaStreamTrack }) {
      await processor.destroy();
      await processor.init(opts);
    },
    async destroy() {
      try { unsubscribe?.(); source?.disconnect(); nodes.forEach((n) => n.disconnect()); } catch { /* уже отключено */ }
      try { await ctx?.close(); } catch { /* уже закрыт */ }
      ctx = null; nodes = []; source = null;
      processor.processedTrack = undefined;
    },
  };
  return processor as unknown as TrackProcessor<Track.Kind.Audio>;
}
