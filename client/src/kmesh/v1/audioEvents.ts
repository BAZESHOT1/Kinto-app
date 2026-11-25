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
