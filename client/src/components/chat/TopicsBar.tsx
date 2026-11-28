/**
 * Полоса топиков группы: «Общий» (все сообщения), текстовые топики и голосовые каналы.
 * Нажатие на голосовой канал — вход (сворачиваемая полоса сверху, как у обычного звонка); внутри канала
 * показываются участники. Модераторы создают топики кнопкой «+», долгое нажатие — переименовать/удалить.
 */
import React from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import type { ChatTopic } from '../../data/api';

const GREEN = '#22C55E';

export function TopicsBar({
  topics,
  activeId,
  canManage,
  voiceActiveId,
  onSelectText,
  onJoinVoice,
  onCreate,
  onRename,
  onDelete,
}: {
  topics: ChatTopic[];
  /** Выбранный текстовый топик (null — «Общий»). */
  activeId: string | null;
  canManage: boolean;
  /** Голосовой топик (или звонок), в котором пользователь сейчас находится. */
  voiceActiveId: string | null;
  onSelectText: (id: string | null) => void;
  onJoinVoice: (topic: ChatTopic) => void;
  onCreate: (kind: 'text' | 'voice', title: string) => void;
  onRename: (topic: ChatTopic, title: string) => void;
  onDelete: (topic: ChatTopic) => void;
}) {
  const theme = useTheme();
  const [creating, setCreating] = React.useState(false);
  const [kind, setKind] = React.useState<'text' | 'voice'>('text');
  const [title, setTitle] = React.useState('');

  const chip = (selected: boolean, accent?: string) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: selected ? accent ?? theme.accent : theme.line,
    backgroundColor: selected ? (accent ? 'rgba(34,197,94,0.16)' : theme.accentSoft) : theme.surfaceElevated,
  });

  const manage = (t: ChatTopic) => {
    if (!canManage || t.auto) return;
    const run = (rename: boolean) => {
      if (!rename) {
        onDelete(t);
        return;
      }
      if (Platform.OS === 'ios' && Alert.prompt) {
        Alert.prompt('Переименовать топик', undefined, (v) => v?.trim() && onRename(t, v.trim()), 'plain-text', t.title);
      } else {
        setKind(t.kind);
        setTitle(t.title);
        setCreating(true);
        renameTarget.current = t;
      }
    };
    Alert.alert(t.title, undefined, [
      { text: 'Переименовать', onPress: () => run(true) },
      { text: 'Удалить', style: 'destructive', onPress: () => run(false) },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };
  const renameTarget = React.useRef<ChatTopic | null>(null);

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    if (renameTarget.current) onRename(renameTarget.current, v);
    else onCreate(kind, v);
    renameTarget.current = null;
    setTitle('');
    setCreating(false);
  };

  return (
    <View style={{ paddingTop: 6 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: 'flex-start' }}>
        <Pressable onPress={() => onSelectText(null)} accessibilityRole="button" style={chip(activeId === null)}>
          <Ionicons name="chatbubbles-outline" size={15} color={activeId === null ? theme.accent : theme.textSecondary} />
          <Text style={{ color: activeId === null ? theme.accent : theme.textPrimary, fontWeight: '700', fontSize: 13.5 }}>Общий</Text>
        </Pressable>
        {topics.map((t) => {
          if (t.kind === 'text') {
            const sel = activeId === t.id;
            return (
              <Pressable key={t.id} onPress={() => onSelectText(t.id)} onLongPress={() => manage(t)} accessibilityRole="button" style={chip(sel)}>
                <Ionicons name="pricetag-outline" size={15} color={sel ? theme.accent : theme.textSecondary} />
                <Text style={{ color: sel ? theme.accent : theme.textPrimary, fontWeight: '700', fontSize: 13.5 }}>{t.title}</Text>
              </Pressable>
            );
          }
          const inside = voiceActiveId === t.id || (t.callId !== null && voiceActiveId === t.callId);
          return (
            <View key={t.id} style={{ alignItems: 'flex-start' }}>
              <Pressable onPress={() => onJoinVoice(t)} onLongPress={() => manage(t)} accessibilityRole="button" accessibilityLabel={`Голосовой канал ${t.title}`} style={chip(inside, GREEN)}>
                <Ionicons name="volume-high" size={15} color={inside ? GREEN : theme.textSecondary} />
                <Text style={{ color: inside ? GREEN : theme.textPrimary, fontWeight: '700', fontSize: 13.5 }}>{t.title}</Text>
                {t.members.length ? <Text style={{ color: GREEN, fontWeight: '800', fontSize: 12.5 }}>{t.members.length}</Text> : null}
              </Pressable>
              {t.members.length ? (
                <View style={{ marginTop: 4, marginLeft: 6, gap: 2 }}>
                  {t.members.slice(0, 6).map((m) => (
                    <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN }} />
                      <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>{m.displayName || m.username}</Text>
                    </View>
                  ))}
                  {t.members.length > 6 ? <Text style={{ color: theme.textSecondary, fontSize: 12 }}>и ещё {t.members.length - 6}</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })}
        {canManage ? (
          <Pressable onPress={() => { renameTarget.current = null; setTitle(''); setCreating((v) => !v); }} accessibilityRole="button" accessibilityLabel="Добавить топик" style={chip(false)}>
            <Ionicons name="add" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </ScrollView>
      {creating ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8 }}>
          {!renameTarget.current ? (
            <Pressable onPress={() => setKind((k) => (k === 'text' ? 'voice' : 'text'))} accessibilityRole="button" style={chip(true, kind === 'voice' ? GREEN : undefined)}>
              <Ionicons name={kind === 'voice' ? 'volume-high' : 'chatbubble-outline'} size={15} color={kind === 'voice' ? GREEN : theme.accent} />
              <Text style={{ color: kind === 'voice' ? GREEN : theme.accent, fontWeight: '700', fontSize: 13 }}>{kind === 'voice' ? 'Голосовой' : 'Текстовый'}</Text>
            </Pressable>
          ) : null}
          <TextInput
            value={title}
            onChangeText={setTitle}
            onSubmitEditing={submit}
            placeholder="Название топика"
            placeholderTextColor={theme.textDisabled}
            maxLength={40}
            autoFocus
            style={{ flex: 1, color: theme.textPrimary, borderWidth: 1, borderColor: theme.line, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.surfaceElevated }}
          />
          <Pressable onPress={submit} accessibilityRole="button" accessibilityLabel="Сохранить" style={chip(true)}>
            <Ionicons name="checkmark" size={18} color={theme.accent} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
