/**
 * API-запросы через kMesh — kMesh App Protocol поверх универсального DATA.
 *
 * Клиент упаковывает обычный REST-запрос в конверт KM2 (scheme 2, ключ — session.meshRelayKey, AES-256-GCM),
 * модули и шлюз переносят его как непрозрачные байты (длинные конверты режутся на сегменты «KS» по ≤192 байт),
 * Hub исполняет запрос от имени пользователя и возвращает ответ тем же путём. Прошивка ничего не знает о
 * содержимом: новый прикладной сценарий — это просто ещё один REST-эндпоинт на Hub.
 *
 * Ограничения (документированы в docs/kmesh-app-protocol.md): запрос ≤ 6 КБ, ответ ≤ 24 КБ (после deflate
 * меньше), около 190 байт на пакет и несколько пакетов в секунду на узел, задержка 2–10 с, только /v1/*
 * кроме auth/admin/firmware/kmesh/objects.
 */
import { deflateSync, inflateSync } from 'fflate';
import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha2';
import { ApiError, getSession } from '../data/api';
import { fromB64, utf8Decode, utf8Encode } from '../crypto/core';
import { randomBytes } from '../crypto/random';
import { decodeEnvelope, encodeEnvelope, SCHEME_SESSION } from '../kmesh/v2/envelope';
import { onKmeshDataPayload, onKmeshDataSegment } from '../kmesh/v1/events';
import { sendKmeshDataPayload } from '../kmesh/v1/runtime';
import { canSendViaMesh, emitMeshEnvelope, getMeshCapabilities } from './meshLink';

export interface MeshHttpResponse {
  status: number;
  body: unknown;
}

type Pending = { resolve: (v: MeshHttpResponse | null) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<number, Pending>();
const assemblies = new Map<number, { total: number; parts: Map<number, Uint8Array>; at: number }>();
let wired = false;
let reqSeq = Math.floor(Math.random() * 60000);
let segSeq = Math.floor(Math.random() * 60000);

const SEGMENT_MAX = 192;
const REQUEST_TIMEOUT_MS = 45_000;

function keyIdFor(deviceId: string): number {
  const h = sha256(utf8Encode(deviceId));
  return (h[0] | (h[1] << 8) | (h[2] << 16) | (h[3] << 24)) >>> 0;
}

/** Целый конверт → тела DATA: один пакет или сегменты «KS». */
export function splitSegments(envelope: Uint8Array, msgId: number): Uint8Array[] {
  if (envelope.length + 2 <= 200) return [envelope];
  const total = Math.ceil(envelope.length / SEGMENT_MAX);
  const out: Uint8Array[] = [];
  for (let i = 0; i < total; i += 1) {
    const chunk = envelope.subarray(i * SEGMENT_MAX, (i + 1) * SEGMENT_MAX);
    const part = new Uint8Array(6 + chunk.length);
    part.set([0x4b, 0x53, msgId & 0xff, (msgId >> 8) & 0xff, i, total], 0);
    part.set(chunk, 6);
    out.push(part);
  }
  return out;
}

function handleEnvelope(bytes: Uint8Array): void {
  const session = getSession();
  if (!session?.meshRelayKey) return;
  const env = decodeEnvelope(bytes);
  if (!env || env.scheme !== SCHEME_SESSION) return;
  try {
    const plain = gcm(fromB64(session.meshRelayKey), env.nonce).decrypt(env.ciphertext);
    const body = plain[0] & 1 ? inflateSync(plain.subarray(1)) : plain.subarray(1);
    const res = JSON.parse(utf8Decode(body)) as { i?: number; s?: number; b?: unknown; e?: string };
    // Событие от Hub без запроса (например входящий звонок по kMesh).
    if (res.e) {
      if (res.e === 'msg') {
        // Новое сообщение от Hub по DATA: тот же формат, что раньше приходил через модуль.
        emitMeshEnvelope(res as never);
        return;
      }
      if (res.e === 'call_in') {
        const ev = res as unknown as Record<string, unknown>;
        void import('../call/callStore').then((m) => m.handleCallIncomingEvent({ ...ev, type: 'call_incoming' }, session.userId));
      }
      return;
    }
    const item = pending.get(Number(res.i));
    if (!item) return;
    pending.delete(Number(res.i));
    clearTimeout(item.timer);
    item.resolve({ status: Number(res.s) || 0, body: res.b });
  } catch {
    /* чужой/повреждённый ответ */
  }
}

export function ensureMeshEvents(): void {
  wire();
}

function wire(): void {
  if (wired) return;
  wired = true;
  onKmeshDataPayload((env) => handleEnvelope(encodeEnvelope(env)));
  onKmeshDataSegment((body) => {
    const msgId = body[2] | (body[3] << 8);
    const idx = body[4];
    const total = body[5];
    if (total < 2 || idx >= total) return;
    let a = assemblies.get(msgId);
    if (!a || a.total !== total) {
      a = { total, parts: new Map(), at: Date.now() };
      assemblies.set(msgId, a);
    }
    a.parts.set(idx, body.slice(6));
    if (a.parts.size < total) return;
    assemblies.delete(msgId);
    const chunks: Uint8Array[] = [];
    for (let i = 0; i < total; i += 1) {
      const c = a.parts.get(i);
      if (!c) return;
      chunks.push(c);
    }
    const whole = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let off = 0;
    for (const c of chunks) { whole.set(c, off); off += c.length; }
    handleEnvelope(whole);
  });
  // Неполные сегменты старше минуты удаляем.
  setInterval(() => {
    const now = Date.now();
    for (const [id, a] of assemblies) if (now - a.at > 60_000) assemblies.delete(id);
  }, 30_000);
}

/** Доступен ли туннель: есть ключ и подключённый модуль с шлюзом. */
export function meshHttpAvailable(): boolean {
  return Boolean(getSession()?.meshRelayKey && canSendViaMesh() && getMeshCapabilities().gateway);
}

/**
 * Выполнить API-запрос через mesh. Возвращает null, если туннель недоступен, запрос слишком велик
 * или истёк таймаут — вызывающий покажет обычную сетевую ошибку.
 */
export async function meshHttpFetch(path: string, init: RequestInit = {}): Promise<MeshHttpResponse | null> {
  const session = getSession();
  if (!session?.meshRelayKey) return null;
  // Эти разделы через mesh не проксируются (Hub ответил бы 403): не тратим время.
  if (/^\/v1\/(admin|auth|objects|uploads|firmware|kmesh)\b/.test(path)) return null;
  wire();

  const method = String(init.method || 'GET').toUpperCase();
  let body: unknown;
  if (typeof init.body === 'string' && init.body) {
    try { body = JSON.parse(init.body); } catch { body = init.body; }
  }
  const reqId = (reqSeq = (reqSeq + 1) & 0xffff);
  const json = utf8Encode(JSON.stringify({ i: reqId, m: method, p: path, ...(body === undefined ? {} : { b: body }) }));
  const packed = deflateSync(json);
  const useDeflate = packed.length < json.length;
  const payload = new Uint8Array(1 + (useDeflate ? packed.length : json.length));
  payload[0] = useDeflate ? 1 : 0;
  payload.set(useDeflate ? packed : json, 1);
  if (payload.length > 6 * 1024) return null;

  const nonce = randomBytes(12);
  const cipher = gcm(fromB64(session.meshRelayKey), nonce).encrypt(payload);
  const envelope = encodeEnvelope({
    scheme: SCHEME_SESSION, flags: 0, keyId: keyIdFor(session.deviceId), nonce, ciphertext: cipher,
  });
  const msgId = (segSeq = (segSeq + 1) & 0xffff);
  const parts = splitSegments(envelope, msgId);

  return new Promise<MeshHttpResponse | null>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(reqId);
      resolve(null);
    }, REQUEST_TIMEOUT_MS);
    pending.set(reqId, { resolve, timer });
    // Сегменты уходят подряд; BLE-канал модуля сам ставит их в очередь.
    let ok = true;
    for (const part of parts) ok = sendKmeshDataPayload(part, false) && ok;
    if (!ok) {
      clearTimeout(timer);
      pending.delete(reqId);
      resolve(null);
    }
  });
}

/** Превратить ответ туннеля в ApiError при не-2xx. */
export function throwIfMeshError(response: MeshHttpResponse): void {
  if (response.status >= 200 && response.status < 300) return;
  const b = (response.body ?? {}) as { error?: string; message?: string };
  throw new ApiError(response.status, b.error ?? 'mesh_http_error', b.message ?? 'mesh_http_error');
}

/**
 * Текст без интернета: Hub сохраняет сообщение (шифрует серверным ключом чата) и рассылает его участникам.
 * true — Hub подтвердил сохранение.
 */
export async function sendTextViaData(chatId: string, text: string, clientId?: string): Promise<boolean> {
  const res = await meshHttpFetch(`/v1/chats/${encodeURIComponent(chatId)}/mesh-text`, {
    method: 'POST',
    body: JSON.stringify({ text, clientId }),
  }).catch(() => null);
  if (!res) return false;
  if (res.status >= 200 && res.status < 300) return true;
  // E2E-чат: Hub не шифрует за клиента — шифротекст собирает messaging.ts и отправляет sendEnvelopeViaData.
  return false;
}

/** Готовый шифротекст сообщения (E2E или серверная схема) через DATA. */
export async function sendEnvelopeViaData(
  chatId: string,
  input: { kind: string; nonce: string; ciphertext: string; scheme?: string; keyVersion?: number; clientId?: string; replyTo?: string },
): Promise<boolean> {
  const res = await meshHttpFetch(`/v1/chats/${encodeURIComponent(chatId)}/mesh-envelope`, {
    method: 'POST',
    body: JSON.stringify(input),
  }).catch(() => null);
  return Boolean(res && res.status >= 200 && res.status < 300);
}
