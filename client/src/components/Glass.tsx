/**
 * Стеклянная поверхность Kinto.
 *
 * Единый слой «матового стекла» для поиска, кнопки создания чата и навбара:
 *  - iOS — нативный BlurView;
 *  - Android — BlurView с экспериментальным методом размытия;
 *  - Web — CSS backdrop-filter.
 *
 * Размытие всегда обрезается по радиусу контейнера (`overflow: 'hidden'`),
 * поэтому под скруглённой капсулой не появляется квадратная подложка.
 */
import React from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/useTheme';
import { NATIVE_BLUR_OK } from './blurSupport';

export const GLASS_BORDER = 'rgba(255, 255, 255, 0.10)';
/** Заливка кнопок шапки: 12% белого. */
export const GLASS_FILL_BUTTON = 'rgba(255, 255, 255, 0.08)';
/** Заливка навбара: 6% белого поверх размытия. */
export const GLASS_FILL_DOCK = 'rgba(255, 255, 255, 0.06)';
/** Фон закреплённых чатов: 6% белого. */
export const PINNED_SURFACE = 'rgba(255, 255, 255, 0.06)';

type GlassProps = ViewProps & {
  /** Заливка поверх размытия (процент белого). */
  fill?: string;
  /** Радиус скругления: по нему же обрезается размытие. */
  radius?: number;
  /** Цвет тонкой обводки. */
  borderColor?: string;
  /** Толщина обводки. */
  borderWidth?: number;
  /** Интенсивность размытия (1–100). */
  intensity?: number;
  /** Тон материала iOS. */
  tint?: 'light' | 'dark' | 'default';
  /** Полностью прозрачная поверхность: без размытия, заливки и обводки. */
  transparent?: boolean;
};

export function Glass({
  children,
  style,
  fill = GLASS_FILL_DOCK,
  radius = 20,
  borderColor = GLASS_BORDER,
  borderWidth = 1,
  intensity = 72,
  tint,
  transparent = false,
  ...rest
}: GlassProps) {
  if (transparent) {
    return (
      <View
        {...rest}
        style={[
          styles.base,
          { borderRadius: radius, borderWidth: 0, borderColor: 'transparent', backgroundColor: 'transparent' },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  const web = Platform.OS === 'web';
  const theme = useTheme();
  const light = !theme.dark;
  // Светлая тема: светлое стекло (белая заливка, светлое размытие, тёмная тонкая обводка).
  // Белые полупрозрачные заливки тёмной темы переводим в их светлый аналог.
  const lightFill = (value: string) => {
    const m = /^rgba\(255,\s*255,\s*255,\s*([0-9.]+)\)$/.exec(value.replace(/\s+/g, ' ').trim());
    if (!m) return value;
    return `rgba(255,255,255,${Math.min(0.92, 0.6 + Number(m[1]) * 2)})`;
  };
  const effFill = light ? lightFill(fill) : fill;
  const effBorder = light && borderColor === GLASS_BORDER ? 'rgba(16,24,40,0.06)' : borderColor;
  const effTint = tint ?? (light ? 'light' : 'dark');
  return (
    <View
      {...rest}
      style={[
        styles.base,
        {
          borderRadius: radius,
          borderWidth,
          borderColor: effBorder,
          // На web лёгкая тёмная подложка нужна, чтобы стекло читалось на чёрном.
          backgroundColor: web ? (light ? 'rgba(255, 255, 255, 0.65)' : 'rgba(10, 10, 12, 0.50)') : 'transparent',
          ...(web
            ? ({
                backdropFilter: 'blur(32px) saturate(1.6)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
              } as object)
            : null),
        },
        style,
      ]}
    >
      {!web && NATIVE_BLUR_OK ? (
        <BlurView
          intensity={intensity}
          tint={effTint}
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {/* Android < 12: без размытия — плотная подложка под заливкой (см. blurSupport). */}
      {!web && !NATIVE_BLUR_OK ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: light ? 'rgba(244,246,250,0.86)' : 'rgba(22,24,30,0.82)' }]} />
      ) : null}
      {/* Заливка поверх стекла: задаёт точный процент белого. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: effFill }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow: hidden — ключ к скруглённому стеклу без квадратных углов.
  base: { overflow: 'hidden' },
});
