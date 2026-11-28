/**
 * Единственный источник safe-area для layout-кода.
 *
 * Инсеты везде приходят из SafeAreaProvider (на web он читает CSS env()).
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type LayoutInsets = { top: number; right: number; bottom: number; left: number };

export function useLayoutInsets(): LayoutInsets {
  const native = useSafeAreaInsets();
  // Как в 1.10.93: на web react-native-safe-area-context сам читает env(safe-area-inset-*), CSS на <body> не нужен.
  return native;
}
