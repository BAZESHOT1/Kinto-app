/** События аудиокадров E-kMesh звонка. */
const listeners = new Set<(frame: Uint8Array) => void>();

export function emitKmeshAudio(frame: Uint8Array): void {
  for (const l of listeners) {
    try { l(frame); } catch { /* слушатель не должен ломать канал */ }
  }
}

export function onKmeshAudio(listener: (frame: Uint8Array) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Входящий универсальный DATA_PAYLOAD (kMesh v2): голос звонка и другие прикладные конверты. */
type DataPayloadListener = (envelope: { scheme: number; flags: number; keyId: number; nonce: Uint8Array; ciphertext: Uint8Array }) => void;
const dataListeners = new Set<DataPayloadListener>();

export function emitKmeshDataPayload(envelope: Parameters<DataPayloadListener>[0]): void {
  for (const l of dataListeners) {
    try { l(envelope); } catch { /* слушатель не должен ломать канал */ }
  }
}

export function onKmeshDataPayload(listener: DataPayloadListener): () => void {
  dataListeners.add(listener);
  return () => { dataListeners.delete(listener); };
}

/** Сегменты длинных DATA (kMesh App Protocol). */
const segListeners = new Set<(body: Uint8Array) => void>();

export function emitKmeshDataSegment(body: Uint8Array): void {
  for (const l of segListeners) {
    try { l(body); } catch { /* слушатель не должен ломать канал */ }
  }
}

export function onKmeshDataSegment(listener: (body: Uint8Array) => void): () => void {
  segListeners.add(listener);
  return () => { segListeners.delete(listener); };
}
