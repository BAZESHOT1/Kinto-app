/**
 * Плавное прогрессивное размытие у края экрана (как в Telegram).
 *
 * Сообщения уходят под шапку/поле ввода: у внутренней границы блока контент чёткий, к краю экрана размытие
 * нарастает без заметных ступеней. Блок ничего не закрашивает — только размывает то, что под ним.
 *  - Web: несколько слоёв backdrop-filter с маской-градиентом.
 *  - Native: стопка BlurView разной высоты (expo-blur не умеет маски, ступени сглажены малым шагом).
 */
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme/useTheme';
import { NATIVE_BLUR_OK } from '../blurSupport';

const BLUR_STEPS_PX = [1, 2, 3.5, 5, 8, 12];

export function ProgressiveBlur({ edge, height }: { edge: 'top' | 'bottom'; height: number }) {
  const theme = useTheme();
  if (height <= 0 || !NATIVE_BLUR_OK) return null;
  const n = BLUR_STEPS_PX.length;
  // «к краю» = вверх для верхнего блока, вниз для нижнего.
  const toInner = edge === 'top' ? 'to bottom' : 'to top';
  const pos = edge === 'top' ? { top: 0 } : { bottom: 0 };

  if (Platform.OS === 'web') {
    return (
      <View pointerEvents="none" style={[styles.box, pos, { height }]}>
        {BLUR_STEPS_PX.map((px, k) => {
          const end = ((n - k) / n) * 100;
          const start = Math.max(0, end - 100 / n);
          const mask = `linear-gradient(${toInner}, #000 0%, #000 ${start}%, transparent ${end}%)`;
          return React.createElement('div', {
            key: k,
            style: {
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              backdropFilter: `blur(${px}px)`,
              WebkitBackdropFilter: `blur(${px}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
              pointerEvents: 'none',
            },
          });
        })}
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={[styles.box, pos, { height }]}>
      {BLUR_STEPS_PX.map((_, k) => (
        <BlurView
          key={k}
          pointerEvents="none"
          intensity={7}
          tint={theme.dark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={[styles.band, pos, { height: (height * (n - k)) / n }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', left: 0, right: 0 },
  band: { position: 'absolute', left: 0, right: 0 },
});
