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

/**
 * Баг iOS 26.x в PWA: env(safe-area-inset-top) = 0, а окно короче экрана на высоту статус-бара (~59 px),
 * из-за чего шапки уезжают под статус-бар. Тогда верхний отступ берём из этой разницы.
 */
function iosPwaTopFallback(): number {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 0;
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!standalone || !/iPhone|iPad/.test(navigator.userAgent)) return 0;
  const gap = Math.max(window.screen?.height ?? 0, window.screen?.width ?? 0) - window.innerHeight;
  return gap >= 40 && gap <= 90 ? Math.round(gap) : 0;
}

function iosPwaDoubleCount(envTop: number): boolean {
  if (envTop <= 0 || typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (!standalone || !/iPhone|iPad/.test(navigator.userAgent)) return false;
  const gap = Math.max(window.screen?.height ?? 0, window.screen?.width ?? 0) - window.innerHeight;
  return gap >= envTop - 8;
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
  // iOS PWA со статус-баром black: окно уже начинается под ним, а env(top) может всё равно быть > 0 — тогда это двойной учёт.
  const dbl = iosPwaDoubleCount(web.top);
  const fallbackTop = 0; // со статус-баром style=black окно начинается под ним: компенсация не нужна
  return {
    top: Math.max(dbl ? 0 : web.top, dbl ? 0 : native.top, fallbackTop),
    right: Math.max(web.right, native.right),
    bottom: Math.max(web.bottom, native.bottom),
    left: Math.max(web.left, native.left),
  };
}
