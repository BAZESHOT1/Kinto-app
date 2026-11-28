/**
 * Шумоподавление на iOS/Android: встроенный в нативный WebRTC (noiseSuppression + echoCancellation + AGC,
 * включаются в audioCaptureDefaults комнаты). Krisp недоступен: он проприетарный и требует LiveKit Cloud.
 */
import type { TrackProcessor, Track } from 'livekit-client';

export function createNoiseProcessor(): TrackProcessor<Track.Kind.Audio> | null {
  return null;
}
