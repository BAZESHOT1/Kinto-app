import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MotiView } from 'moti';
import { useTheme } from '../../theme/useTheme';
import type { ViewMessage } from '../../data/messaging';

/** Текст самого меню не выделяется (выделяется только текст сообщения). */
const NO_SELECT = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as never;

const hhmm = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** «сегодня в 21:39», «вчера в 21:39», «12 ноября в 21:39». */
export function formatSentAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
    if (days === 0) return `сегодня в ${hhmm(d)}`;
    if (days === 1) return `вчера в ${hhmm(d)}`;
    return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${hhmm(d)}`;
  } catch {
    return '';
  }
}

const ROW_H = 52;
const HEADER_H = 54;

/**
 * Меню действий по долгому нажатию — в стиле Telegram: стеклянная карточка под сообщением
 * с временем отправки сверху и крупными пунктами (иконка слева). Реакции живут в ReactionPicker.
 */
export function MessageActionSheet({
  message,
  pinned,
  onClose,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onPin,
  onRetry,
  allowCopy = true,
  anchor,
}: {
  message: ViewMessage | null;
  pinned: boolean;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  /** Повторить отправку несостоявшегося сообщения. */
  onRetry?: () => void;
  /** Секретный чат: копирование запрещено. */
  allowCopy?: boolean;
  /** Экранные координаты сообщения — меню раскрывается под ним. */
  anchor?: { x: number; y: number; width: number; height: number } | null;
}) {
  const theme = useTheme();
  const open = Boolean(message);
  const { width: screenW, height: screenH } = useWindowDimensions();

  React.useEffect(() => {
    if (!open || Platform.OS === 'web') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [open, message?.id]);

  const failed = Boolean(message?.failed);
  const canRetry = Boolean(onRetry) && failed && Boolean(message?.mine);
  const canEdit = Boolean(message?.mine) && message?.kind === 'text' && !failed && Boolean(message?.id);
  const canCopy = allowCopy && Boolean(message?.text);

  type Item = { key: string; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean; accent?: boolean };
  const items: Item[] = [];
  if (canRetry) items.push({ key: 'retry', icon: 'refresh-circle-outline', label: 'Повторить отправку', onPress: onRetry!, accent: true });
  items.push({ key: 'reply', icon: 'arrow-undo-outline', label: 'Ответить', onPress: onReply });
  if (canCopy) items.push({ key: 'copy', icon: 'copy-outline', label: 'Скопировать', onPress: onCopy });
  if (canEdit) items.push({ key: 'edit', icon: 'create-outline', label: 'Изменить', onPress: onEdit });
  if (canEdit) items.push({ key: 'pin', icon: pinned ? 'pin-outline' : 'pin', label: pinned ? 'Открепить' : 'Закрепить', onPress: onPin });
  items.push({
    key: 'delete',
    icon: message?.pending || failed ? 'close-circle-outline' : 'trash-outline',
    label: message?.pending || failed ? 'Убрать сообщение' : 'Удалить',
    onPress: onDelete,
    danger: true,
  });

  const cardW = Math.min(276, screenW - 24);
  const cardH = HEADER_H + items.length * ROW_H + 12;
  const mine = Boolean(message?.mine);
  const rawLeft = anchor ? (mine ? anchor.x + anchor.width - cardW : anchor.x) : (screenW - cardW) / 2;
  const left = Math.max(12, Math.min(rawLeft, screenW - cardW - 12));
  let top = anchor ? anchor.y + anchor.height + 10 : screenH * 0.35;
  // Не помещается снизу — поднимаем меню, чтобы оно целиком было на экране.
  if (top + cardH > screenH - 12) top = Math.max(12, screenH - cardH - 12);

  if (!open || !message) return null;

  const fill = theme.dark ? 'rgba(34,34,38,0.66)' : 'rgba(250,250,252,0.82)';
  const border = theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)';
  const divider = theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  const text = theme.dark ? '#FFFFFF' : '#111114';
  const sub = theme.dark ? 'rgba(235,235,245,0.62)' : 'rgba(60,60,67,0.6)';

  return (
    <View pointerEvents="box-none" style={[styles.root, NO_SELECT]}>
      <MotiView
        from={{ opacity: 0, scale: 0.88, translateY: -8 }}
        animate={{ opacity: 1, scale: 1, translateY: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 320 }}
        style={[styles.card, { borderColor: border, position: 'absolute' as const, left, top, width: cardW }]}
      >
        <BlurView
          intensity={Platform.OS === 'web' ? 0 : 80}
          tint={theme.dark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, { backgroundColor: fill }, Platform.OS === 'web' ? ({ backdropFilter: 'blur(40px) saturate(1.8)', WebkitBackdropFilter: 'blur(40px) saturate(1.8)' } as object) : null]}
          pointerEvents="none"
        />
        {/* Заголовок: статус и время отправки. */}
        <View style={[styles.header, { borderBottomColor: divider }]}>
          <Ionicons
            name={failed ? 'alert-circle' : message.pending ? 'time-outline' : message.mine ? 'checkmark-done' : 'time-outline'}
            size={20}
            color={failed ? theme.danger : sub}
          />
          <Text numberOfLines={1} style={{ color: text, fontSize: 15.5, flex: 1 }}>
            {failed ? 'Не отправлено' : message.pending ? 'Отправляется…' : formatSentAt(message.createdAt)}
          </Text>
        </View>
        {items.map((it) => (
          <Pressable
            key={it.key}
            onPress={it.onPress}
            accessibilityRole="button"
            accessibilityLabel={it.label}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? (theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)') : 'transparent' }]}
          >
            <Ionicons name={it.icon} size={24} color={it.danger ? '#FF5A4F' : it.accent ? theme.accent : text} />
            <Text style={{ color: it.danger ? '#FF5A4F' : it.accent ? theme.accent : text, fontSize: 17, flex: 1 }}>{it.label}</Text>
          </Pressable>
        ))}
      </MotiView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject },
  card: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
    paddingBottom: 6,
  },
  header: {
    height: HEADER_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20 },
});
