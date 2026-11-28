/**
 * iOS/Android: захват микрофона и воспроизведение сырого PCM требуют нативного модуля.
 * Звонок через LiveKit (интернет) на телефонах работает полностью; голос через E-kMesh на телефонах
 * пока недоступен — используйте web/Windows-клиент либо интернет.
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
