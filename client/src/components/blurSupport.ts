import { Platform } from 'react-native';

/**
 * Нативное размытие (dimezis BlurView) на Android < 12 работает через RenderScript. На части устройств
 * (например MediaTek, Android 9: «Failed loading RS driver») после первого кадра экран остаётся белым —
 * вью есть, но ничего не рисуется. Там вместо размытия используется плотная полупрозрачная заливка.
 */
export const NATIVE_BLUR_OK =
  Platform.OS === 'ios' || Platform.OS === 'web' || (Platform.OS === 'android' && Number(Platform.Version) >= 31);
