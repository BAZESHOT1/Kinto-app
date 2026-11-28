/**
 * Состояние удержания сообщения: размытый фон, копия сообщения, панель реакций и меню действий в одной
 * прокручиваемой колонке — длинное сообщение листается вместе с меню (они не налезают на него).
 *
 * Расстановка зависит от свободного места вокруг исходного сообщения:
 *  - по умолчанию реакции над сообщением, действия под ним;
 *  - снизу не хватает места для действий — они переносятся наверх, над реакции;
 *  - сверху не хватает места для реакций — реакции переносятся под сообщение, между ним и действиями.
 * Если всё равно не помещается — колонка просто прокручивается.
 */
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';
import { useTheme } from '../../theme/useTheme';
import { useLayoutInsets } from '../../theme/useLayoutInsets';
import { NATIVE_BLUR_OK } from '../blurSupport';

export type HoldFrame = { x: number; y: number; width: number; height: number };
const GAP = 8;

export function HoldOverlay({
  anchor,
  mine,
  onClose,
  bubble,
  reactions,
  actions,
}: {
  anchor: HoldFrame | null;
  mine: boolean;
  onClose: () => void;
  /** Копия сообщения (текст выделяется). */
  bubble: React.ReactNode;
  /** Панель реакций: получает колбэк измерения высоты. */
  reactions: (onHeight: (h: number) => void) => React.ReactNode;
  /** Меню действий: получает колбэк измерения высоты. */
  actions: (onHeight: (h: number) => void) => React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useLayoutInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [msgH, setMsgH] = React.useState(anchor?.height ?? 60);
  const [rH, setRH] = React.useState(58);
  const [aH, setAH] = React.useState(230);

  const topInset = insets.top + 12;
  const bottomInset = insets.bottom + 12;
  const a = anchor ?? { x: 12, y: H * 0.38, width: W - 24, height: 60 };

  const spaceAbove = a.y - topInset;
  const spaceBelow = H - bottomInset - (a.y + msgH);
  let order: Array<'R' | 'M' | 'A'>;
  if (spaceAbove >= rH + GAP) {
    if (spaceBelow >= aH + GAP) order = ['R', 'M', 'A'];
    else if (spaceAbove >= rH + aH + GAP * 2) order = ['A', 'R', 'M'];
    else order = ['R', 'M', 'A'];
  } else {
    order = ['M', 'R', 'A'];
  }
  const size = { R: rH, M: msgH, A: aH };
  const above = order.slice(0, order.indexOf('M')).reduce((sum, k) => sum + size[k] + GAP, 0);
  const total = order.reduce((sum, k) => sum + size[k], 0) + GAP * (order.length - 1);
  // Сообщение остаётся на своём месте, если колонка помещается; иначе сдвигаем и позволяем прокрутку.
  const desiredTop = a.y - above;
  const maxTop = Math.max(topInset, H - bottomInset - total);
  const stackTop = Math.max(topInset, Math.min(desiredTop, maxTop));

  const fillDim = theme.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.38)';
  const parts: Record<'R' | 'M' | 'A', React.ReactNode> = {
    R: <View key="R">{reactions(setRH)}</View>,
    M: (
      <View
        key="M"
        onLayout={(e) => setMsgH(Math.round(e.nativeEvent.layout.height))}
        // Нажатие по сообщению не закрывает оверлей (иначе нельзя выделить текст); долгое нажатие по тексту — выделение.
        onStartShouldSetResponder={() => true}
        style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '100%' }}
      >
        {bubble}
      </View>
    ),
    A: <View key="A">{actions(setAH)}</View>,
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Размытие и затемнение всего экрана; нажатие по пустому месту закрывает. */}
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть меню сообщения" style={StyleSheet.absoluteFill}>
        {Platform.OS === 'web' ? (
          React.createElement('div', {
            style: {
              position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
              backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)', background: fillDim,
            },
          })
        ) : NATIVE_BLUR_OK ? (
          <BlurView intensity={45} tint={theme.dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
        ) : (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: fillDim }]} />
        )}
      </Pressable>

      <ScrollView
        style={StyleSheet.absoluteFill}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: stackTop, paddingBottom: bottomInset, paddingHorizontal: 12, minHeight: H }}
      >
        {/* Пустые места колонки тоже закрывают оверлей, а вложенные элементы получают свои нажатия. */}
        <Pressable onPress={onClose} accessible={false} style={{ gap: GAP }}>
          <MotiView from={{ opacity: 0, translateY: 6 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 140 }} style={{ gap: GAP }}>
            {order.map((k) => parts[k])}
          </MotiView>
        </Pressable>
      </ScrollView>
    </View>
  );
}
