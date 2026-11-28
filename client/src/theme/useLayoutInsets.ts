/**
 * Единственный источник safe-area для layout-кода.
 *
 * Native: инсеты из SafeAreaProvider. Web/PWA: читаем CSS `env(safe-area-inset-*)` напрямую
 * (скрытый элемент с padding: env(...)) — библиотека на web в iOS-PWA может вернуть нули.
 * CSS на <body> safe-area не добавляет, поэтому двойного отступа нет.
 */
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type LayoutInsets = { top: number; right: number; bottom: number; left: number };

const ZERO: LayoutInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function probeWebInsets(): LayoutInsets | null {
  if (typeof document === 'undefined' || !document.body) return null;
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:0;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(el);
  const cs = getComputedStyle(el);
  const out = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  el.remove();
  return out;
}

function useWebInsets(): LayoutInsets {
  const [v, setV] = React.useState<LayoutInsets>(() => probeWebInsets() ?? ZERO);
  React.useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const update = () => {
      const next = probeWebInsets();
      if (!next) return;
      setV((prev) =>
        prev.top === next.top && prev.bottom === next.bottom && prev.left === next.left && prev.right === next.right ? prev : next,
      );
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);
  return v;
}

export function useLayoutInsets(): LayoutInsets {
  const native = useSafeAreaInsets();
  const web = useWebInsets();
  if (Platform.OS !== 'web') return native;
  // Берём большее из двух источников: любой из них может оказаться нулевым.
  return {
    top: Math.max(web.top, native.top),
    right: Math.max(web.right, native.right),
    bottom: Math.max(web.bottom, native.bottom),
    left: Math.max(web.left, native.left),
  };
}
