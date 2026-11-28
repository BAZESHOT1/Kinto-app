/** Аудиосессия звонка на iOS/Android: режим «связь», вывод — телефонный динамик или громкая связь. */
import { Platform } from 'react-native';
import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';

export const supportsSpeakerToggle = true;

export async function startCallAudioSession(): Promise<void> {
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
  await AudioSession.stopAudioSession();
}

export async function setSpeakerphone(on: boolean): Promise<void> {
  const id = Platform.OS === 'ios' ? (on ? 'force_speaker' : 'default') : on ? 'speaker' : 'earpiece';
  await AudioSession.selectAudioOutput(id);
}
