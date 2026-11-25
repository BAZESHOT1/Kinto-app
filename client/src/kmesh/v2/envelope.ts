/**
 * Kinto kMesh v2 — универсальная полезная нагрузка и подпись управления.
 *
 * Прошивка — слепой курьер: для неё DATA_PAYLOAD это непрозрачный набор байт.
 * Все форматы ниже живут ТОЛЬКО на уровне приложения, поэтому новые функции
 * (файлы, уведомления, новые API) добавляются без перепрошивки модулей.
 *
 * Ключи:
 *  - чаты: ECDH (P-256, `derivePairKey`) + AES-256-GCM. Ключ знают только двое.
 *  - Hub: TLS-сессия приложения; через mesh идёт уже зашифрованный blob
 *    сессионного ключа (`session.meshRelayKey`) — шлюз не имеет ключей.
 *  - управление (beacon/presence/RREQ/RREP): не шифруется, но подписывается
 *    Ed25519 приватным ключом узла/приложения.
 *
 * Общего TEMP_MESH_KEY для данных v2 НЕ использует.
 */
import { gcm } from '@noble/ciphers/aes';
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { randomBytes } from '../../crypto/random';
import { fromB64, toB64, utf8Decode, utf8Encode } from '../../crypto/core';
import { kv } from '../../crypto/storage';
import {
  DATA_PAYLOAD_FLAG_VOICE,
  QOS_NORMAL,
  QOS_VOICE,
  RpcOp,
} from '../v1/protocol';

const MAGIC = [0x4b, 0x4d, 0x32] as const; // "KM2"
const VERSION = 1;
const HEADER = 24; // magic(3) + ver(1) + flags(1) + scheme(1) + keyId(4) + nonce(12) + len(2)

export const SCHEME_PAIR = 1; // ECDH + AES-GCM, ключ чата
export const SCHEME_SESSION = 2; // сессионный ключ, установленный по TLS с Hub
export const ENVELOPE_FLAG_VOICE = DATA_PAYLOAD_FLAG_VOICE;

export interface DataEnvelope {
  scheme: number;
  flags: number;
  keyId: number;
  nonce: Uint8Array;
  ciphertext: Uint8Array; // AES-GCM: ciphertext || tag
}

/* ------------------------------------------------------------- envelope --- */

export function encodeEnvelope(env: DataEnvelope): Uint8Array {
  if (env.ciphertext.length > 0xffff) throw new Error('envelope_too_large');
  const out = new Uint8Array(HEADER + env.ciphertext.length);
  out.set(MAGIC, 0);
  out[3] = VERSION;
  out[4] = env.flags & 0xff;
  out[5] = env.scheme & 0xff;
  new DataView(out.buffer).setUint32(6, env.keyId >>> 0, true);
  out.set(env.nonce, 10);
  new DataView(out.buffer).setUint16(22, env.ciphertext.length, true);
  out.set(env.ciphertext, HEADER);
  return out;
}

export function decodeEnvelope(bytes: Uint8Array): DataEnvelope | null {
  if (bytes.length < HEADER + 16) return null;
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2]) return null;
  if (bytes[3] !== VERSION) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint16(22, true);
  if (bytes.length !== HEADER + len) return null;
  return {
    scheme: bytes[5],
    flags: bytes[4],
    keyId: view.getUint32(6, true),
    nonce: bytes.slice(10, 22),
    ciphertext: bytes.slice(HEADER),
  };
}

/** Зашифровать произвольные байты приложения в универсальный конверт. */
export function sealEnvelope(
  key: Uint8Array,
  plaintext: Uint8Array,
  opts: { keyId: number; scheme?: number; voice?: boolean },
): Uint8Array {
  const nonce = randomBytes(12);
  const ciphertext = gcm(key, nonce).encrypt(plaintext);
  return encodeEnvelope({
    scheme: opts.scheme ?? SCHEME_PAIR,
    flags: opts.voice ? ENVELOPE_FLAG_VOICE : 0,
    keyId: opts.keyId >>> 0,
    nonce,
    ciphertext,
  });
}

/** Расшифровать конверт; ключ подбирает приложение по keyId/scheme. */
export function openEnvelope(key: Uint8Array, bytes: Uint8Array): Uint8Array | null {
  const env = decodeEnvelope(bytes);
  if (!env) return null;
  try {
    return gcm(key, env.nonce).decrypt(env.ciphertext);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------ RPC wire --- */

/**
 * Упаковка в RPC_UP: [0x33][flags][envelope]. Прошивка читает только opcode
 * и flags (VOICE_PRIORITY), конверт не трогает.
 */
export function makeDataPayloadRpc(envelope: Uint8Array, voice = false): Uint8Array {
  const out = new Uint8Array(2 + envelope.length);
  out[0] = RpcOp.DATA_PAYLOAD;
  out[1] = voice ? DATA_PAYLOAD_FLAG_VOICE : 0;
  out.set(envelope, 2);
  return out;
}

export function parseDataPayloadRpc(bytes: Uint8Array): DataEnvelope | null {
  if (bytes.length < 3 || bytes[0] !== RpcOp.DATA_PAYLOAD) return null;
  return decodeEnvelope(bytes.slice(2));
}

export function qosFromEnvelope(env: DataEnvelope): number {
  return env.flags & ENVELOPE_FLAG_VOICE ? QOS_VOICE : QOS_NORMAL;
}

/* ------------------------------------------------- control signatures --- */

const CTRL_KEY = 'sg:kmesh:v2:ctrl_priv';

/** Приватный Ed25519-ключ приложения для подписи управляющих пакетов. */
export async function ensureControlPrivateKey(): Promise<string> {
  const saved = await kv.get(CTRL_KEY);
  if (saved) return saved;
  const priv = toB64(ed25519.utils.randomPrivateKey());
  await kv.set(CTRL_KEY, priv);
  return priv;
}

export function controlPublicKey(privB64: string): string {
  return toB64(ed25519.getPublicKey(fromB64(privB64)));
}

/** Канонический digest — байт-в-байт совпадает с kl_crypto_control_digest(). */
export function controlDigest(input: {
  type: number;
  packetId: number;
  msgUuid: bigint;
  srcId: number;
  dstId: number;
  payload: Uint8Array;
}): Uint8Array {
  const payload = input.payload;
  const buf = new Uint8Array(1 + 4 + 8 + 4 + 4 + 1 + payload.length);
  const view = new DataView(buf.buffer);
  let n = 0;
  buf[n++] = input.type & 0xff;
  view.setUint32(n, input.packetId >>> 0, true); n += 4;
  view.setBigUint64(n, BigInt.asUintN(64, input.msgUuid), true); n += 8;
  view.setUint32(n, input.srcId >>> 0, true); n += 4;
  view.setUint32(n, input.dstId >>> 0, true); n += 4;
  buf[n++] = payload.length & 0xff;
  buf.set(payload, n);
  return sha256(buf);
}

export function signControl(digest: Uint8Array, privB64: string): Uint8Array {
  return ed25519.sign(digest, fromB64(privB64));
}

export function verifyControl(digest: Uint8Array, sig: Uint8Array, pubB64: string): boolean {
  try {
    return ed25519.verify(sig, digest, fromB64(pubB64));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- helpers --- */

export function sealText(
  key: Uint8Array,
  text: string,
  opts: { keyId: number; scheme?: number; voice?: boolean },
): Uint8Array {
  return sealEnvelope(key, utf8Encode(text), opts);
}

export function openText(key: Uint8Array, bytes: Uint8Array): string | null {
  const plain = openEnvelope(key, bytes);
  return plain ? utf8Decode(plain) : null;
}
