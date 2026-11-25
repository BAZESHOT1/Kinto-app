/**
 * Нативная платформа: Opus-поток через kMesh пока использует WebRTC-медиа
 * (см. transport.native.ts). Возвращаем no-op, чтобы экран звонка работал и без него.
 */
export interface MeshAudioHandle { stop: () => void; }
export async function startMeshAudio(_roomId: string): Promise<MeshAudioHandle> {
  return { stop: () => undefined };
}
