/**
 * Комната звонка на LiveKit. Единый код для web, Android, iOS и Windows (браузерная оболочка):
 * различия сведены к audioSession.* (маршрутизация вывода на телефонах) и globals.* (WebRTC-глобали).
 */
import { Platform } from 'react-native';
import type { Participant, RemoteTrack, ConnectionState as LkConnectionState } from 'livekit-client';
import { createNoiseProcessor } from './noiseSuppression';
import { effectiveAgc, getAudioPrefs, onAudioPrefsChanged } from './audioPrefs';
import { getSavedVolume, saveVolume } from './callVolumes';
import { callFlag } from './callFlags';
import { ensureCallGlobals, guarded } from './globals';
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
  /** Моя громкость этого собеседника, 0…2 (100 % = 1). */
  volume: number;
  /** Модератор запретил участнику микрофон (у всех). */
  modMuted: boolean;
};

export type CallRoomHandle = {
  setMuted: (muted: boolean) => Promise<void>;
  setSpeaker: (on: boolean) => Promise<void>;
  /** Громкость собеседника у меня, 0…2 (0 — заглушить у себя). */
  setParticipantVolume: (id: string, volume: number) => void;
  disconnect: () => Promise<void>;
};

export type JoinOptions = {
  url: string;
  token: string;
  onParticipants: (list: CallParticipantView[]) => void;
  onPhase: (phase: CallPhase, reason?: string) => void;
};

const volumes = new Map<string, number>();

const view = (p: Participant, local: boolean): CallParticipantView => ({
  id: p.identity,
  name: p.name || p.identity,
  local,
  speaking: p.isSpeaking,
  muted: !p.isMicrophoneEnabled,
  level: p.audioLevel ?? 0,
  volume: volumes.get(p.identity) ?? getSavedVolume(p.identity) ?? 1,
  modMuted: p.permissions ? p.permissions.canPublish === false : false,
});

/** Подключиться к комнате: адрес сервера и токен выдаёт Hub (POST /v1/calls/start или /join). */
export async function joinCallRoom(opts: JoinOptions): Promise<CallRoomHandle> {
  // livekit-client грузится только в момент звонка (на телефонах — после регистрации WebRTC-глобалей).
  console.log('[call] step globals');
  ensureCallGlobals();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ConnectionState, DisconnectReason, Room, RoomEvent, Track } = guarded(() => require('livekit-client') as typeof import('livekit-client'));
  console.log('[call] step audio-session');
  if (!callFlag('nosess')) await startCallAudioSession();
  const prefs = getAudioPrefs();
  if (callFlag('lkdebug')) {
    try {
      const lk = require('livekit-client') as typeof import('livekit-client');
      lk.setLogLevel(lk.LogLevel.trace);
    } catch { /* диагностика */ }
  }
  const room = new Room({
    adaptiveStream: false,
    // Web: громкость собеседников через WebAudio (GainNode) — доступно усиление выше 100 %.
    webAudioMix: Platform.OS === 'web',
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    // Эквивалент getUserMedia({ audio: { noiseSuppression: true } }): web/Windows — браузерный движок,
    // iOS/Android — react-native-webrtc (noiseSuppression) поверх AVAudioSession voiceChat / NoiseSuppressor.
    audioCaptureDefaults: {
      echoCancellation: prefs.echoCancellation,
      noiseSuppression: prefs.noiseSuppression,
      autoGainControl: callFlag('agc1') || effectiveAgc(prefs, Platform.OS !== 'web'),
      // Расширенные ограничения (voiceIsolation, sampleRate, channelCount) — только web/Windows: на телефонах WebRTC их не знает.
      ...(Platform.OS === 'web' ? { voiceIsolation: prefs.noiseSuppression, channelCount: 1, sampleRate: 48000 } : null),
      ...(prefs.micDeviceId ? { deviceId: prefs.micDeviceId } : null),
    },
    // Голос по интернету: Opus fullband (48 кГц) 32 кбит/с (при плохой сети снижается до 24, см. ниже), DTX, RED против потерь. AGC выключен — голос не «плоский».
    // На телефонах DTX/RED отключены: с ними JS-поток зависал на публикации микрофона (100 % CPU, кнопки не нажимались).
    publishDefaults: { audioPreset: { maxBitrate: callFlag('p64') ? 64_000 : 32_000 }, dtx: Platform.OS === 'web' || callFlag('dtx'), red: Platform.OS === 'web' || callFlag('red') },
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
    .on(RoomEvent.ParticipantConnected, (p) => {
      // Громкость, выставленная ранее, действует и после переподключения собеседника.
      const v = volumes.get(p.identity) ?? getSavedVolume(p.identity);
      if (v !== undefined) (p as unknown as { setVolume: (x: number) => void }).setVolume(v);
      emit();
    })
    .on(RoomEvent.TrackSubscribed, (track, _pub, p) => {
      const v = volumes.get(p.identity) ?? getSavedVolume(p.identity);
      if (v !== undefined && track.kind === Track.Kind.Audio) (p as unknown as { setVolume: (x: number) => void }).setVolume(v);
    })
    .on(RoomEvent.ParticipantPermissionsChanged, (_prev, p) => {
      if (callFlag('nph')) return;
      // Модератор вернул право говорить — снова включаем микрофон (если я сам его не выключал).
      if (p === room.localParticipant && p.permissions?.canPublish !== false && !wantMuted && !room.localParticipant.isMicrophoneEnabled) {
        void room.localParticipant.setMicrophoneEnabled(true).then(emit).catch(() => undefined);
      }
      emit();
    })
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
    .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      if (callFlag('noq')) return;
      // Адаптивный битрейт: при плохом качестве сети 24 кбит/с, иначе 32.
      if (participant !== room.localParticipant) return;
      try {
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        const sender = (pub?.audioTrack as unknown as { sender?: RTCRtpSender } | undefined)?.sender;
        if (!sender) return;
        const params = sender.getParameters();
        if (!params.encodings?.length) return;
        const want = quality === 'poor' || quality === 'lost' ? 24_000 : 32_000;
        if (params.encodings[0].maxBitrate !== want) {
          params.encodings[0].maxBitrate = want;
          void sender.setParameters(params).catch(() => undefined);
        }
      } catch {
        /* не критично */
      }
    })
    .on(RoomEvent.Disconnected, (reason) =>
      // DUPLICATE_IDENTITY: тот же аккаунт вошёл в звонок на другом устройстве.
      opts.onPhase('disconnected', reason === DisconnectReason.DUPLICATE_IDENTITY ? 'duplicate' : reason !== undefined ? String(reason) : undefined))
    .on(RoomEvent.AudioPlaybackStatusChanged, () => {
      // Автовоспроизведение в браузере требует жеста пользователя; он у нас был (нажатие «Позвонить»/«Принять»).
      if (!room.canPlaybackAudio) void room.startAudio().catch(() => undefined);
    });

  let wantMuted = false;
  let stopPrefsWatch: (() => void) | null = null;
  opts.onPhase('connecting');
  try {
    console.log('[call] step connect', opts.url);
    await room.connect(opts.url, opts.token, { autoSubscribe: true, peerConnectionTimeout: 30_000, websocketTimeout: 20_000 });
    console.log('[call] step microphone');
    if (!callFlag('nomic')) await room.localParticipant.setMicrophoneEnabled(true);
    console.log('[call] step ready');
    // Настройки звука меняются во время звонка: перезапускаем захват микрофона с новыми ограничениями.
    if (!callFlag('nopw')) stopPrefsWatch = onAudioPrefsChanged(() => {
      const next = getAudioPrefs();
      const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
      if (!mic) return;
      void mic
        .restartTrack({
          echoCancellation: next.echoCancellation,
          noiseSuppression: next.noiseSuppression,
          autoGainControl: effectiveAgc(next, Platform.OS !== 'web'),
          ...(Platform.OS === 'web' ? { voiceIsolation: next.noiseSuppression, channelCount: 1, sampleRate: 48000 } : null),
          ...(next.micDeviceId ? { deviceId: next.micDeviceId } : null),
        })
        .catch((e) => console.warn('[call] restart mic failed', String(e)));
    });
    // iOS: микрофон мог остаться выключенным (сессия ещё не активна) — проверяем и включаем повторно, пока пользователь сам его не выключил.
    for (const delay of callFlag('nowd') ? [] : [1200, 3500, 8000]) {
      setTimeout(() => {
        if (wantMuted || room.state !== ConnectionState.Connected || room.localParticipant.isMicrophoneEnabled) return;
        console.warn('[call] mic was off, re-enabling');
        void room.localParticipant.setMicrophoneEnabled(true).then(emit).catch(() => undefined);
      }, delay);
    }
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
      wantMuted = muted;
      await room.localParticipant.setMicrophoneEnabled(!muted);
      emit();
    },
    setParticipantVolume: (id, volume) => {
      const v = Math.max(0, Math.min(2, volume));
      volumes.set(id, v);
      saveVolume(id, v);
      const p = room.remoteParticipants.get(id);
      if (p) (p as unknown as { setVolume: (x: number) => void }).setVolume(v);
      emit();
    },
    setSpeaker: async (on) => {
      await setSpeakerphone(on).catch(() => undefined);
    },
    disconnect: async () => {
      volumes.clear();
      stopPrefsWatch?.();
      audioEls.forEach((el) => el.remove());
      audioEls.clear();
      await room.disconnect().catch(() => undefined);
      await stopCallAudioSession().catch(() => undefined);
    },
  };
}
