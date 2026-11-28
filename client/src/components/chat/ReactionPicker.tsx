/**
 * Панель реакций по долгому нажатию на сообщение — в стиле Telegram:
 * стеклянная «пилюля» с быстрыми эмодзи и круглой кнопкой-шевроном, которая раскрывает полный набор.
 * Панель выравнивается по стороне сообщения (своё — вправо, чужое — влево) и стоит над ним.
 */
import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useTheme } from '../../theme/useTheme';
import { useReducedMotion } from '../useReducedMotion';
import { PressableScale } from './PressableScale';
import { motion } from '../../theme/motion';

export const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🔥', '🙏'] as const;

/** Полный набор — раскрывается шевроном. */
/** Текст самого меню не выделяется (выделяется только текст сообщения). */
const NO_SELECT = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as never;

const MORE_REACTIONS = [
  '👍', '👎', '❤️', '🔥', '🥰', '👏', '😁', '🤔',
  '🤯', '😱', '🤬', '😢', '🎉', '🤩', '🤮', '💩',
  '🙏', '👌', '🕊', '🤡', '🥱', '🥴', '😍', '🐳',
  '❤️‍🔥', '🌚', '🌭', '💯', '🤣', '⚡', '🍌', '🏆',
  '💔', '🤨', '😐', '🍓', '🍾', '💋', '🖕', '😈',
  '😴', '😭', '🤓', '👻', '👨‍💻', '👀', '🎃', '🙈',
] as const;

export type BubbleFrame = { x: number; y: number; width: number; height: number };

export function ReactionPicker({
  visible,
  onClose,
  onPick,
  anchor,
  mine = false,
  inline = false,
  onLayoutHeight,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  /** Оставлено для совместимости: кнопка-шеврон раскрывает набор внутри панели. */
  onMore?: () => void;
  /** Экранные координаты сообщения — панель всплывает над ним. */
  anchor?: BubbleFrame | null;
  /** Своё сообщение: панель прижимается к правому краю пузыря. */
  mine?: boolean;
  /** Встроенный режим: панель лежит в потоке оверлея (он сам расставляет меню и прокручивается). */
  inline?: boolean;
  onLayoutHeight?: (h: number) => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  const cardW = Math.min(expanded ? 372 : 396, screenW - 24);
  const right = anchor ? anchor.x + anchor.width : screenW - 12;
  const rawLeft = anchor ? (mine ? right - cardW : anchor.x) : (screenW - cardW) / 2;
  const left = Math.max(12, Math.min(rawLeft, screenW - cardW - 12));
  // Панель над сообщением; если сверху мало места — под ним.
  const flip = anchor ? anchor.y < 80 : false;
  const position = anchor
    ? flip
      ? { top: anchor.y + anchor.height + 8 }
      : { bottom: screenH - anchor.y + 8 }
    : { top: screenH / 2 };

  if (!visible) return null;

  const fill = theme.dark ? 'rgba(34,34,38,0.62)' : 'rgba(250,250,252,0.78)';
  const border = theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';

  const Wrapper = inline ? View : View;
  return (
    <Wrapper pointerEvents="box-none" style={[inline ? { alignSelf: mine ? 'flex-end' : 'flex-start' } : StyleSheet.absoluteFill, NO_SELECT]}>
      <MotiView
        from={{ opacity: 0, scale: reduced ? 1 : 0.86, translateY: reduced ? 0 : 10 }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={reduced ? { type: 'timing', duration: 0 } : motion.spring}
        style={[
          styles.card,
          expanded ? styles.cardExpanded : null,
          inline ? { borderColor: border, width: cardW } : { borderColor: border, position: 'absolute' as const, left, width: cardW, ...position },
        ]}
        onLayout={(e) => onLayoutHeight?.(Math.round(e.nativeEvent.layout.height))}
      >
        <BlurView
          intensity={Platform.OS === 'web' ? 0 : 70}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: fill }, Platform.OS === 'web' ? ({ backdropFilter: 'blur(36px) saturate(1.7)', WebkitBackdropFilter: 'blur(36px) saturate(1.7)' } as object) : null]}
          pointerEvents="none"
        />
        {expanded ? (
          <ScrollView style={{ maxHeight: 232 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.grid}>
            {MORE_REACTIONS.map((emoji) => (
              <PressableScale
                key={emoji}
                pressedScale={0.86}
                onPress={() => onPick(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`Реакция ${emoji}`}
                style={styles.gridCell}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        ) : (
          <View style={styles.row}>
            {QUICK_REACTIONS.map((emoji, index) => (
              <MotiView
                key={emoji}
                from={{ opacity: 0, scale: reduced ? 1 : 0.6, translateY: reduced ? 0 : 8 }}
                animate={{ opacity: 1, scale: 1, translateY: 0 }}
                transition={reduced ? { type: 'timing', duration: 0 } : { ...motion.spring, delay: index * motion.staggerStepMs }}
              >
                <PressableScale
                  pressedScale={0.84}
                  onPress={() => onPick(emoji)}
                  accessibilityRole="button"
                  accessibilityLabel={`Реакция ${emoji}`}
                  style={styles.emojiBtn}
                >
                  <Text style={styles.emoji}>{emoji}</Text>
                </PressableScale>
              </MotiView>
            ))}
            <PressableScale
              pressedScale={0.9}
              onPress={() => setExpanded(true)}
              accessibilityRole="button"
              accessibilityLabel="Больше реакций"
              style={[styles.moreBtn, { backgroundColor: theme.dark ? 'rgba(120,120,128,0.55)' : 'rgba(120,120,128,0.28)' }]}
            >
              <Ionicons name="chevron-down" size={22} color={theme.dark ? '#FFFFFF' : '#1C1C1E'} />
            </PressableScale>
          </View>
        )}
      </MotiView>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  cardExpanded: { borderRadius: 26 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10 },
  gridCell: { width: '12.5%', height: 44, alignItems: 'center', justifyContent: 'center' },
  emojiBtn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 28 },
  moreBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
