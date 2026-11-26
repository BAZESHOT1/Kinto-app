import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { MotiView } from 'moti';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../theme/useTheme';
import type { ViewMessage } from '../../data/messaging';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

/**
 * Меню долгого нажатия на сообщение: быстрые реакции, повтор отправки и действия.
 * Открывается снизу как лист, закрывается тапом по фону; на мобильных даёт тактильный отклик.
 */
export function MessageActionSheet({
  message,
  pinned,
  onClose,
  onReact,
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
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  /** Повторить отправку несостоявшегося сообщения. */
  onRetry?: () => void;
  /** Секретный чат: копирование/пересылка запрещены. */
  allowCopy?: boolean;
  /** Экранные координаты сообщения — меню раскрывается под ним. */
  anchor?: { x: number; y: number; width: number; height: number } | null;
}) {
  const theme = useTheme();
  const open = Boolean(message);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const cardW = Math.min(520, screenW - 24);
  const top = anchor ? Math.min(anchor.y + anchor.height + 8, screenH * 0.55) : screenH * 0.35;
  const left = anchor
    ? Math.max(12, Math.min(anchor.x + anchor.width / 2 - cardW / 2, screenW - cardW - 12))
    : (screenW - cardW) / 2;
  const maxCardH = Math.max(160, screenH - top - 24);

  // Тактильный отклик при открытии меню (на web — no-op).
  React.useEffect(() => {
    if (!open || Platform.OS === 'web') return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  }, [open, message?.id]);

  const failed = Boolean(message?.failed);
  const canRetry = Boolean(onRetry) && failed && Boolean(message?.mine);
  const canEdit = Boolean(message?.mine) && message?.kind === 'text' && !failed && Boolean(message?.id);
  const preview = message
    ? message.kind === 'media'
      ? 'Вложение'
      : message.text || 'Зашифрованное сообщение'
    : '';
  const icon: keyof typeof Ionicons.glyphMap = message?.kind === 'media' ? 'image-outline' : 'chatbubble-ellipses-outline';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Закрыть меню сообщения"
        >
          {/* Размытие фона одновременно с подъёмом сообщения и выездом меню. */}
          <BlurView
            intensity={40}
            tint={theme.dark ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
        </Pressable>
        {message ? (
          <MotiView
            from={{ opacity: 0, translateY: 36, scale: 0.98 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            transition={{ type: 'spring', damping: 25, stiffness: 320 }}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: theme.line,
                ...theme.shadow,
                position: 'absolute' as const,
                left,
                top,
                width: cardW,
                maxHeight: maxCardH,
                borderRadius: 20,
                overflow: 'hidden' as const,
              },
            ]}
          >
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: maxCardH }}
            contentContainerStyle={{ paddingBottom: 10 }}
          >
            <View style={styles.grabber}>
              <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: theme.line }} />
            </View>

            {/* Превью сообщения: иконка, автор, время и текст. */}
            <View style={[styles.preview, { backgroundColor: theme.surface, borderColor: theme.line }]}>
              <Ionicons name={icon} size={16} color={theme.textSecondary} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={{ color: theme.textPrimary, fontSize: 12.5, fontWeight: '800', flexShrink: 1 }}>
                    {message.mine ? 'Вы' : message.senderUsername}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{fmtTime(message.createdAt)}</Text>
                  {failed ? <Ionicons name="alert-circle" size={12} color={theme.danger} /> : null}
                </View>
                <Text numberOfLines={2} style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 1 }}>
                  {preview}
                </Text>
              </View>
            </View>

            <View style={[styles.reactions, { borderColor: theme.line }]}>
              {QUICK_REACTIONS.map((emoji) => (
                <MotiView
                  key={emoji}
                  from={{ scale: 0.85 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 16, stiffness: 340 }}
                >
                  <Pressable
                    onPress={() => onReact(emoji)}
                    accessibilityRole="button"
                    accessibilityLabel={`Реакция ${emoji}`}
                    style={({ pressed }) => [styles.reactionBtn, { backgroundColor: pressed ? theme.accentSoft : theme.surface }]}
                  >
                    <Text style={{ fontSize: 21 }}>{emoji}</Text>
                  </Pressable>
                </MotiView>
              ))}
            </View>

            {canRetry ? (
              <Action icon="refresh-circle-outline" label="Повторить отправку" accent onPress={onRetry!} />
            ) : null}
            <Action icon="arrow-undo-outline" label="Ответить" onPress={onReply} />
            {allowCopy && message.text ? <Action icon="copy-outline" label="Копировать" onPress={onCopy} /> : null}
            {canEdit ? <Action icon="create-outline" label="Изменить" onPress={onEdit} /> : null}
            {canEdit ? (
              <Action icon={pinned ? 'pin-outline' : 'pin'} label={pinned ? 'Открепить' : 'Закрепить'} onPress={onPin} />
            ) : null}
            <Action
              icon={message.pending || failed ? 'close-circle-outline' : 'trash-outline'}
              label={message.pending || failed ? 'Убрать сообщение' : 'Удалить'}
              danger
              onPress={onDelete}
            />
          </ScrollView>
          </MotiView>
        ) : null}
      </View>
    </Modal>
  );
}

function Action({
  icon,
  label,
  onPress,
  danger,
  accent,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
  accent?: boolean;
}) {
  const theme = useTheme();
  const color = danger ? theme.danger : accent ? theme.accent : theme.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { backgroundColor: pressed ? (danger ? theme.dangerSoft : theme.surfacePressed) : 'transparent' }]}
    >
      <Ionicons name={icon} size={18} color={danger ? theme.danger : accent ? theme.accent : theme.textSecondary} />
      <Text style={{ color, fontSize: 15, flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: {
    width: '100%',
    maxWidth: 520,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 12,
    paddingBottom: 18,
    paddingTop: 8,
    gap: 6,
  },
  grabber: { alignItems: 'center', paddingVertical: 6 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 2,
  },
  reactions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 8,
    marginVertical: 4,
  },
  reactionBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 10,
    minHeight: 44,
  },
});
