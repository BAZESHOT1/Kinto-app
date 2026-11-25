/**
 * E-kMesh аудиотранспорт (веб): Opus 20 мс / 16 kbps, кадры идут через
 * KMeshV1Client.sendAudioFrame → прошивка → Hub → MCU, микс возвращается
 * через kMesh downlink и событие onKmeshAudio.
 */
import { Platform } from 'react-native';
import OpusScript from 'opusscript';
import { onKmeshAudio } from '../kmesh/v1/events';
import { sendKmeshAudio } from '../kmesh/v1/runtime';

const FRAME = 960; // 20 мс @ 48 kHz
const BYTES = FRAME * 2;

export interface MeshAudioHandle {
  stop: () => void;
}

export async function startMeshAudio(roomId: string): Promise<MeshAudioHandle> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    // Нативо́м аудио через kMesh пока недоступно: используется WebRTC-транспорт.
    return { stop: () => undefined };
  }
  const encoder = new OpusScript(48000, 1, OpusScript.Application.VOIP);
  const decoder = new OpusScript(48000, 1, OpusScript.Application.VOIP);
  encoder.setBitrate(16000);
  decoder.setBitrate(16000);

  const ctx = new AudioContext({ sampleRate: 48000 });
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(FRAME, 1, 1);
  let seq = 0;
  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(FRAME);
    for (let i = 0; i < FRAME; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const opus = encoder.encode(Buffer.from(pcm.buffer), FRAME) as Uint8Array;
    if (opus?.length) sendKmeshAudio(roomId, seq++, opus);
  };
  source.connect(processor);
  processor.connect(ctx.destination);

  const un = onKmeshAudio((frame) => {
    if (frame.length < 2) return;
    try {
      const opus = frame.subarray(2); // первые 2 байта — seq
      const pcmBytes = decoder.decode(Buffer.from(opus));
      if (!pcmBytes || pcmBytes.length < BYTES) return;
      const buffer = ctx.createBuffer(1, FRAME, 48000);
      const out = buffer.getChannelData(0);
      for (let i = 0; i < FRAME; i += 1) out[i] = pcmBytes.readInt16LE(i * 2) / 32768;
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      node.start();
    } catch { /* битый кадр — пропускаем */ }
  });

  return {
    stop: () => {
      un();
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
