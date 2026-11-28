/**
 * iOS/Android: PCM-захват/воспроизведение для голоса через kMesh временно отключены.
 * Нативный аудиомодуль конфликтовал с WebRTC (LiveKit) за аудиосессию и мог ронять приложение при звонке по интернету.
 * Голос через kMesh на телефонах вернётся отдельным модулем после проверки совместимости.
 */
import type { MeshAudioIO } from './meshAudioIO';
export type { MeshAudioIO } from './meshAudioIO';

export function createMeshAudioIO(): MeshAudioIO {
  return {
    async start() {
      throw new Error('mesh_audio_native_unsupported');
    },
    play() {},
    setMuted() {},
    stop() {},
  };
}
