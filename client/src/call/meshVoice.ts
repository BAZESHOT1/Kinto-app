/**
 * Голос звонка через E-kMesh (Codec2 3200 бит/с поверх ESP-NOW).
 * Ключ звонка выдаёт Hub (POST /v1/calls/:id/mesh/join); голос шифруется AES-128-GCM и едет как
 * универсальный DATA_PAYLOAD kMesh v2 — прошивка модулей и шлюза о звонках ничего не знает.
 * На сервере kMesh audio gateway перекодирует Codec2 <-> Opus, поэтому участники из интернета и из mesh слышат друг друга.
 */
import { fromB64 } from '../crypto/core';
import { onKmeshDataPayload } from '../kmesh/v1/events';
import { sendKmeshDataPayload } from '../kmesh/v1/runtime';
import { createCodec2, type Codec2Instance } from './codec2';
import { createMeshAudioIO } from './meshAudioIO';
import { openCallAudio, packAudio, sealCallAudio, unpackAudio } from './meshWire';

export type MeshParams = {
  callId: string;
  key: string; // base64, 16 байт
  keyId: number;
  bitrate: 3200 | 1200 | 700;
  frameMs: number;
  batch: number;
  /** Канал звонка: от него зависит транспорт голоса (строго LoRa или строго ESP-NOW). */
  channel?: 'e-kmesh' | 'l-kmesh';
};

export type MeshVoiceHandle = { setMuted: (muted: boolean) => void; stop: () => void };

const SILENCE_RMS = 180;
const HANGOVER_MS = 300;

export async function startMeshVoice(params: MeshParams): Promise<MeshVoiceHandle> {
  const key = fromB64(params.key);
  const [enc, dec] = await Promise.all([createCodec2(params.bitrate), createCodec2(params.bitrate)]);
  const io = createMeshAudioIO();
  const spf = enc.samplesPerFrame;

  // --- голос из микрофона -> Codec2 -> конверт -> модуль ---
  let acc = new Int16Array(0);
  let frameIdx = 0;
  let hang = 0;
  let pending: Uint8Array[] = [];
  let pendingIdx = 0;
  const flush = () => {
    if (!pending.length) return;
    const payload = packAudio(params.bitrate, pendingIdx, pending);
    pending = [];
    sendKmeshDataPayload(sealCallAudio(key, params.keyId, payload), true, params.channel === 'l-kmesh' ? 'lora' : 'espnow');
  };
  await io.start((chunk) => {
    const merged = new Int16Array(acc.length + chunk.length);
    merged.set(acc, 0);
    merged.set(chunk, acc.length);
    let off = 0;
    while (merged.length - off >= spf) {
      const pcm = merged.slice(off, off + spf);
      off += spf;
      let sum = 0;
      for (let i = 0; i < pcm.length; i += 1) sum += pcm[i] * pcm[i];
      const idx = frameIdx++;
      if (Math.sqrt(sum / pcm.length) >= SILENCE_RMS) hang = HANGOVER_MS;
      else hang -= params.frameMs;
      if (hang <= 0) { flush(); continue; } // тишина: в эфир кадры не отправляем
      if (!pending.length) pendingIdx = idx;
      pending.push(enc.encode(pcm));
      if (pending.length >= params.batch) flush();
    }
    acc = merged.slice(off);
  });

  // --- голос комнаты: модуль -> конверт -> Codec2 -> динамик ---
  let lastEnd = -1;
  const un = onKmeshDataPayload((env) => {
    const plain = openCallAudio(key, env);
    if (!plain) return;
    const pkt = unpackAudio(plain, (br) => (br === params.bitrate ? dec.bytesPerFrame : 0));
    if (!pkt) return;
    const gapFrames = lastEnd >= 0 ? Math.max(0, pkt.frameIdx - lastEnd) : 0;
    pkt.frames.forEach((bits, i) => io.play(dec.decode(bits), i === 0 ? gapFrames * params.frameMs : 0));
    lastEnd = pkt.frameIdx + pkt.frames.length;
  });

  return {
    setMuted: (m) => io.setMuted(m),
    stop: () => {
      un();
      flush();
      io.stop();
      enc.destroy();
      dec.destroy();
    },
  };
}

export type { Codec2Instance };
