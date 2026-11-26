/**
 * Единственный источник safe-area для layout-кода.
 *
 * Web/PWA: safe-area рисует CSS (`env(safe-area-inset-*)` на <body>), поэтому
 * JS-инсеты должны быть нулевыми — иначе отступ применяется дважды.
 * Native: инсеты приходят из SafeAreaProvider (реальные метрики устройства).
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type LayoutInsets = { top: number; right: number; bottom: number; left: number };

const ZERO: LayoutInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function useLayoutInsets(): LayoutInsets {
  const native = useSafeAreaInsets();
  return Platform.OS === 'web' ? ZERO : native;
}
