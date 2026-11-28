/** Аудиосессия звонка на iOS/Android: режим «связь», вывод — телефонный динамик или громкая связь. */
import { Platform } from 'react-native';
import { ensureCallGlobals } from './globals';

// Нативный модуль подключается лениво: при запуске приложения он не загружается.
const lk = () => {
  ensureCallGlobals();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@livekit/react-native') as typeof import('@livekit/react-native');
};

export const supportsSpeakerToggle = true;

export async function startCallAudioSession(): Promise<void> {
  const { AndroidAudioTypePresets, AudioSession } = lk();
  await AudioSession.configureAudio({
    android: {
      preferredOutputList: ['earpiece', 'speaker', 'bluetooth', 'headset'],
      audioTypeOptions: AndroidAudioTypePresets.communication,
    },
    ios: { defaultOutput: 'earpiece' },
  });
  await AudioSession.startAudioSession();
}

export async function stopCallAudioSession(): Promise<void> {
  await lk().AudioSession.stopAudioSession();
}

export async function setSpeakerphone(on: boolean): Promise<void> {
  const id = Platform.OS === 'ios' ? (on ? 'force_speaker' : 'default') : on ? 'speaker' : 'earpiece';
  await lk().AudioSession.selectAudioOutput(id);
}
