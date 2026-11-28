/**
 * Android/iOS: захват микрофона и воспроизведение сырого PCM 8 кГц для голоса через kMesh.
 * Нативный модуль react-native-audio-api (JSI): AudioRecorder отдаёт Float32-кадры,
 * AudioBufferQueueSourceNode проигрывает очередь буферов. Модуль подгружается лениво — только при mesh-звонке,
 * чтобы не влиять на запуск приложения.
 */
import type { MeshAudioIO } from './meshAudioIO';
export type { MeshAudioIO } from './meshAudioIO';

const RATE = 8000;
const CHUNK = 160; // 20 мс

/* eslint-disable @typescript-eslint/no-explicit-any */
export function createMeshAudioIO(): MeshAudioIO {
  let recorder: any = null;
  let ctx: any = null;
  let queue: any = null;
  let muted = false;
  let acc = new Int16Array(0);

  return {
    async start(onPcm) {
      const api = require('react-native-audio-api') as any;
      const { AudioContext, AudioRecorder } = api;
      // Системный аудиосеанс: запись + воспроизведение, громкая связь по умолчанию для голоса.
      try {
        if (api.AudioManager?.setSystemOptions) {
          api.AudioManager.setSystemOptions({ ios: { category: 'playAndRecord', mode: 'voiceChat', options: ['defaultToSpeaker', 'allowBluetooth'] } });
        } else {
          api.AudioManager?.setAudioSessionOptions?.({ iosCategory: 'playAndRecord', iosMode: 'voiceChat', iosOptions: ['defaultToSpeaker', 'allowBluetooth'] });
        }
        await api.AudioManager?.requestRecordingPermissions?.();
        await api.AudioManager?.setAudioSessionActivity?.(true);
      } catch {
        /* продолжаем: часть версий настраивает сеанс сама */
      }
      ctx = new AudioContext({ sampleRate: RATE });
      queue = ctx.createBufferQueueSource();
      queue.connect(ctx.destination);
      queue.start();

      const onReady = (event: any) => {
        const input: Float32Array = event.buffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        if (!muted) {
          for (let i = 0; i < input.length; i += 1) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
        }
        const merged = new Int16Array(acc.length + pcm.length);
        merged.set(acc, 0);
        merged.set(pcm, acc.length);
        let off = 0;
        while (merged.length - off >= CHUNK) {
          onPcm(merged.slice(off, off + CHUNK));
          off += CHUNK;
        }
        acc = merged.slice(off);
      };
      // Старые версии библиотеки принимают параметры в конструкторе, новые — в onAudioReady.
      if (AudioRecorder.length === 0 && api.AudioManager?.setSystemOptions) {
        recorder = new AudioRecorder();
        recorder.onAudioReady({ sampleRate: RATE, bufferLength: CHUNK, channelCount: 1 }, onReady);
      } else {
        recorder = new AudioRecorder({ sampleRate: RATE, bufferLengthInSamples: CHUNK });
        recorder.onAudioReady(onReady);
      }
      const res = await recorder.start();
      if (res && res.status === 'error') throw new Error(`mesh_audio_native_failed:${res.message ?? 'record'}`);
    },
    play(pcm, gapMs = 0) {
      if (!ctx || !queue) return;
      // Пауза перед фразой (тишина говорящего) — буфер нулей нужной длины, чтобы сохранить ритм речи.
      const gapSamples = Math.min(RATE, Math.round((gapMs / 1000) * RATE));
      const total = gapSamples + pcm.length;
      const buf = ctx.createBuffer(1, total, RATE);
      const f = new Float32Array(total);
      for (let i = 0; i < pcm.length; i += 1) f[gapSamples + i] = pcm[i] / 32768;
      buf.copyToChannel(f, 0);
      queue.enqueueBuffer(buf);
    },
    setMuted(m) {
      muted = m;
    },
    stop() {
      try { recorder?.clearOnAudioReady?.(); void recorder?.stop?.(); } catch { /* уже остановлен */ }
      try { queue?.stop?.(); } catch { /* уже остановлен */ }
      try { void ctx?.close?.(); } catch { /* уже закрыт */ }
      recorder = null; queue = null; ctx = null; acc = new Int16Array(0);
    },
  };
}
