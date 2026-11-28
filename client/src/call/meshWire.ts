/**
 * Формат аудио E-kMesh (внутри конверта kMesh v2, шифруется ключом звонка; прошивка его не читает).
 * Совпадает с services/kmesh-audio/src/wire.js:
 *   [ver=1][codec u8: 0=3200, 1=1200][frameIdx u32 LE][n u8][n * bytesPerFrame]
 */
import { gcm } from '@noble/ciphers/aes';
import { randomBytes } from '../crypto/random';
import { encodeEnvelope, decodeEnvelope, ENVELOPE_FLAG_VOICE } from '../kmesh/v2/envelope';

export const SCHEME_CALL_AUDIO = 0x10;
const CODEC_ID: Record<number, number> = { 3200: 0, 1200: 1, 700: 2 };
const CODEC_BITRATE: Record<number, number> = { 0: 3200, 1: 1200, 2: 700 };

export function packAudio(bitrate: number, frameIdx: number, frames: Uint8Array[]): Uint8Array {
  const bpf = frames[0].length;
  const out = new Uint8Array(7 + frames.length * bpf);
  out[0] = 1;
  out[1] = CODEC_ID[bitrate];
  new DataView(out.buffer).setUint32(2, frameIdx >>> 0, true);
  out[6] = frames.length;
  frames.forEach((f, i) => out.set(f, 7 + i * bpf));
  return out;
}

export function unpackAudio(bytes: Uint8Array, bytesPerFrame: (bitrate: number) => number) {
  if (bytes.length < 7 || bytes[0] !== 1) return null;
  const bitrate = CODEC_BITRATE[bytes[1]];
  if (!bitrate) return null;
  const bpf = bytesPerFrame(bitrate);
  const n = bytes[6];
  if (!bpf || bytes.length < 7 + n * bpf) return null;
  const frameIdx = new DataView(bytes.buffer, bytes.byteOffset).getUint32(2, true);
  const frames: Uint8Array[] = [];
  for (let i = 0; i < n; i += 1) frames.push(bytes.slice(7 + i * bpf, 7 + (i + 1) * bpf));
  return { bitrate, frameIdx, frames };
}

/**
 * Конверт: ciphertext = nonce(12) || AES-128-GCM(payload) || tag(16); поле nonce в заголовке — нули
 * (Hub хранит принятый конверт без него). Совпадает с services/hub/src/meshAudio.ts.
 */
export function sealCallAudio(key: Uint8Array, keyId: number, payload: Uint8Array): Uint8Array {
  const nonce = randomBytes(12);
  const enc = gcm(key, nonce).encrypt(payload);
  const ciphertext = new Uint8Array(12 + enc.length);
  ciphertext.set(nonce, 0);
  ciphertext.set(enc, 12);
  return encodeEnvelope({ scheme: SCHEME_CALL_AUDIO, flags: ENVELOPE_FLAG_VOICE, keyId, nonce: new Uint8Array(12), ciphertext });
}

export function openCallAudio(key: Uint8Array, env: { scheme: number; ciphertext: Uint8Array }): Uint8Array | null {
  if (env.scheme !== SCHEME_CALL_AUDIO || env.ciphertext.length < 12 + 16) return null;
  try {
    return gcm(key, env.ciphertext.slice(0, 12)).decrypt(env.ciphertext.slice(12));
  } catch {
    return null;
  }
}

export { decodeEnvelope };
