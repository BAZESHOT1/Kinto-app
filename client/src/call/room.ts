/**
 * Комната звонка на LiveKit. Единый код для web, Android, iOS и Windows (браузерная оболочка):
 * различия сведены к audioSession.* (маршрутизация вывода на телефонах) и globals.* (WebRTC-глобали).
 */
import { Platform } from 'react-native';
import type { Participant, RemoteTrack, ConnectionState as LkConnectionState } from 'livekit-client';
import { createNoiseProcessor } from './noiseSuppression';
import { ensureCallGlobals } from './globals';
import { setSpeakerphone, startCallAudioSession, stopCallAudioSession } from './audioSession';

export type CallChannel = 'internet' | 'e-kmesh' | 'l-kmesh';

export type CallPhase = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type CallParticipantView = {
  id: string;
  name: string;
  local: boolean;
  speaking: boolean;
  muted: boolean;
  /** Громкость 0..1 для индикатора. */
  level: number;
};

export type CallRoomHandle = {
  setMuted: (muted: boolean) => Promise<void>;
  setSpeaker: (on: boolean) => Promise<void>;
  disconnect: () => Promise<void>;
};

export type JoinOptions = {
  url: string;
  token: string;
  onParticipants: (list: CallParticipantView[]) => void;
  onPhase: (phase: CallPhase, reason?: string) => void;
};

const view = (p: Participant, local: boolean): CallParticipantView => ({
  id: p.identity,
  name: p.name || p.identity,
  local,
  speaking: p.isSpeaking,
  muted: !p.isMicrophoneEnabled,
  level: p.audioLevel ?? 0,
});

/** Подключиться к комнате: адрес сервера и токен выдаёт Hub (POST /v1/calls/start или /join). */
export async function joinCallRoom(opts: JoinOptions): Promise<CallRoomHandle> {
  // livekit-client грузится только в момент звонка (на телефонах — после регистрации WebRTC-глобалей).
  console.log('[call] step globals');
  ensureCallGlobals();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AudioPresets, ConnectionState, Room, RoomEvent, Track } = require('livekit-client') as typeof import('livekit-client');
  console.log('[call] step audio-session');
  await startCallAudioSession();
  const room = new Room({
    adaptiveStream: false,
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    // Эквивалент getUserMedia({ audio: { noiseSuppression: true } }): web/Windows — браузерный движок,
    // iOS/Android — react-native-webrtc (noiseSuppression) поверх AVAudioSession voiceChat / NoiseSuppressor.
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, voiceIsolation: true },
    publishDefaults: { audioPreset: AudioPresets.speech, dtx: true, red: true },
  });

  const audioEls = new Map<string, HTMLMediaElement>();
  const emit = () => {
    const list: CallParticipantView[] = [view(room.localParticipant, true)];
    room.remoteParticipants.forEach((p) => list.push(view(p, false)));
    opts.onParticipants(list);
  };

  // Web: удалённое аудио нужно подключить к <audio>; на iOS/Android им управляет нативный WebRTC.
  const attach = (track: RemoteTrack) => {
    if (Platform.OS !== 'web' || track.kind !== Track.Kind.Audio || typeof document === 'undefined') return;
    const el = track.attach() as HTMLMediaElement;
    el.style.display = 'none';
    document.body.appendChild(el);
    audioEls.set(track.sid ?? '', el);
  };
  const detach = (track: RemoteTrack) => {
    const el = audioEls.get(track.sid ?? '');
    track.detach();
    el?.remove();
    audioEls.delete(track.sid ?? '');
  };

  room
    .on(RoomEvent.TrackSubscribed, (track) => { attach(track); emit(); })
    .on(RoomEvent.TrackUnsubscribed, (track) => { detach(track); emit(); })
    .on(RoomEvent.ParticipantConnected, emit)
    .on(RoomEvent.ParticipantDisconnected, emit)
    .on(RoomEvent.ActiveSpeakersChanged, emit)
    .on(RoomEvent.TrackMuted, emit)
    .on(RoomEvent.TrackUnmuted, emit)
    .on(RoomEvent.LocalTrackPublished, emit)
    .on(RoomEvent.ConnectionStateChanged, (state: LkConnectionState) => {
      if (state === ConnectionState.Connected) opts.onPhase('connected');
      else if (state === ConnectionState.Reconnecting) opts.onPhase('reconnecting');
      else if (state === ConnectionState.Connecting) opts.onPhase('connecting');
    })
    .on(RoomEvent.Disconnected, (reason) => opts.onPhase('disconnected', reason !== undefined ? String(reason) : undefined))
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      // Автовоспроизведение в браузере требует жеста пользователя; он у нас был (нажатие «Позвонить»/«Принять»).
      if (!room.canPlaybackAudio) void room.startAudio().catch(() => undefined);
    });

  opts.onPhase('connecting');
  try {
    console.log('[call] step connect', opts.url);
    await room.connect(opts.url, opts.token, { autoSubscribe: true });
    console.log('[call] step microphone');
    await room.localParticipant.setMicrophoneEnabled(true);
    console.log('[call] step ready');
    if (Platform.OS === 'web') {
      await room.startAudio().catch(() => undefined);
      // Локальное шумоподавление RNNoise (web и Windows). Ошибка не должна ломать звонок.
      try {
        const proc = createNoiseProcessor();
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const track = pub?.audioTrack;
        if (proc && track) await track.setProcessor(proc);
      } catch (e) {
        console.warn('[call] noise suppression unavailable', String(e));
      }
    }
  } catch (e) {
    await stopCallAudioSession().catch(() => undefined);
    room.disconnect();
    throw e;
  }
  emit();

  return {
    setMuted: async (muted) => {
      await room.localParticipant.setMicrophoneEnabled(!muted);
      emit();
    },
    setSpeaker: async (on) => {
      await setSpeakerphone(on).catch(() => undefined);
    },
    disconnect: async () => {
      audioEls.forEach((el) => el.remove());
      audioEls.clear();
      await room.disconnect().catch(() => undefined);
      await stopCallAudioSession().catch(() => undefined);
    },
  };
}
