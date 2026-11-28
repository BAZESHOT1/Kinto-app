/**
 * Настройки звука звонков (хранятся на устройстве): шумо- и эхоподавление, автоусиление, усиление микрофона,
 * выбор микрофона (web/Windows) и «студийная» цепочка обработки голоса (web/Windows).
 * Меняются в «Настройки → Звонки и звук»; во время звонка применяются сразу (см. room.ts).
 */
import { create } from 'zustand';
import { kv } from '../crypto/storage';

export type AudioPrefs = {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  /** Громкость микрофона 0…2 (0–200 %). На web/Windows — усиление в цепочке обработки; на телефонах выше 1.25 включается системное AGC. */
  micGain: number;
  /** Идентификатор выбранного микрофона (web/Windows); пусто — по умолчанию. */
  micDeviceId: string;
  /** Лёгкая обработка голоса: фильтр гула, мягкая компрессия, присутствие (web/Windows). */
  voiceChain: boolean;
};

export const DEFAULT_AUDIO_PREFS: AudioPrefs = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: false,
  micGain: 1,
  micDeviceId: '',
  voiceChain: true,
};

const KEY = 'sg:audio-prefs';

type State = AudioPrefs & { loaded: boolean; set: (patch: Partial<AudioPrefs>) => void };

export const useAudioPrefs = create<State>((set, get) => ({
  ...DEFAULT_AUDIO_PREFS,
  loaded: false,
  set: (patch) => {
    set(patch);
    const { loaded: _l, set: _s, ...prefs } = get();
    void Promise.resolve(kv.set(KEY, JSON.stringify(prefs))).catch(() => undefined);
    listeners.forEach((fn) => fn());
  },
}));

const listeners = new Set<() => void>();
/** Звонок подписывается, чтобы применить изменения настроек «на лету». */
export function onAudioPrefsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAudioPrefs(): AudioPrefs {
  const { noiseSuppression, echoCancellation, autoGainControl, micGain, micDeviceId, voiceChain } = useAudioPrefs.getState();
  return { noiseSuppression, echoCancellation, autoGainControl, micGain, micDeviceId, voiceChain };
}

// Загрузка сохранённых значений при старте (best-effort: до загрузки действуют значения по умолчанию).
void Promise.resolve(kv.get(KEY))
  .then((raw) => {
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
      const patch: Partial<AudioPrefs> = {};
      if (typeof parsed.noiseSuppression === 'boolean') patch.noiseSuppression = parsed.noiseSuppression;
      if (typeof parsed.echoCancellation === 'boolean') patch.echoCancellation = parsed.echoCancellation;
      if (typeof parsed.autoGainControl === 'boolean') patch.autoGainControl = parsed.autoGainControl;
      if (typeof parsed.micGain === 'number' && parsed.micGain >= 0 && parsed.micGain <= 2) patch.micGain = parsed.micGain;
      if (typeof parsed.micDeviceId === 'string') patch.micDeviceId = parsed.micDeviceId;
      if (typeof parsed.voiceChain === 'boolean') patch.voiceChain = parsed.voiceChain;
      useAudioPrefs.setState({ ...patch, loaded: true });
    } catch {
      /* повреждённое значение — остаются значения по умолчанию */
    }
  })
  .catch(() => undefined);

/** Автоусиление с учётом ползунка: на телефонах «усиление» микрофона = системное AGC (ручного усиления в WebRTC нет). */
export function effectiveAgc(prefs: AudioPrefs, native: boolean): boolean {
  return prefs.autoGainControl || (native && prefs.micGain > 1.25);
}
