/**
 * Полоса топиков группы: «Общий» (все сообщения), текстовые топики и голосовые каналы.
 * Нажатие на голосовой канал — вход (сворачиваемая полоса сверху, как у обычного звонка); внутри канала
 * показываются участники. Модераторы создают топики кнопкой «+», долгое нажатие — переименовать/удалить.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
  // Редактор топика (создание / переименование) и меню действий — модальные окна (работают и на web).
  const [editor, setEditor] = React.useState<{ mode: 'create' | 'rename'; topic: ChatTopic | null } | null>(null);
  const [menu, setMenu] = React.useState<ChatTopic | null>(null);
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

  const openCreate = () => { setKind('text'); setTitle(''); setEditor({ mode: 'create', topic: null }); };
  const manage = (t: ChatTopic) => { if (canManage && !t.auto) setMenu(t); };
  const submit = () => {
    const v = title.trim();
    if (!v || !editor) return;
    if (editor.mode === 'rename' && editor.topic) onRename(editor.topic, v);
    else onCreate(kind, v);
    setEditor(null);
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
          <Pressable onPress={openCreate} accessibilityRole="button" accessibilityLabel="Добавить топик" style={chip(false)}>
            <Ionicons name="add" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </ScrollView>
      <Modal visible={editor !== null} transparent animationType="fade" onRequestClose={() => setEditor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }} onPress={() => setEditor(null)}>
          <Pressable onPress={() => undefined} style={{ alignSelf: 'center', width: '100%', maxWidth: 420, borderRadius: 24, padding: 18, gap: 14, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.line }}>
            <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '800' }}>{editor?.mode === 'rename' ? 'Переименовать топик' : 'Новый топик'}</Text>
            {editor?.mode === 'create' ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {([['text', 'Текстовый', 'chatbubble-outline', undefined], ['voice', 'Голосовой', 'volume-high', GREEN]] as const).map(([k, label, icon, accent]) => {
                  const sel = kind === k;
                  return (
                    <Pressable key={k} onPress={() => setKind(k)} accessibilityRole="button" style={[chip(sel, accent), { flex: 1, justifyContent: 'center', paddingVertical: 12 }]}>
                      <Ionicons name={icon} size={17} color={sel ? accent ?? theme.accent : theme.textSecondary} />
                      <Text style={{ color: sel ? accent ?? theme.accent : theme.textPrimary, fontWeight: '700', fontSize: 14 }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {editor?.mode === 'create' ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 17 }}>
                {kind === 'voice' ? 'Голосовой топик — постоянная комната: участники входят и выходят, остальным никто не звонит.' : 'Текстовый топик — отдельная лента сообщений; в «Общем» видны сообщения всех топиков.'}
              </Text>
            ) : null}
            <TextInput
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={submit}
              placeholder="Название (например, Флуд)"
              placeholderTextColor={theme.textDisabled}
              maxLength={40}
              autoFocus
              style={{ color: theme.textPrimary, fontSize: 16, borderWidth: 1, borderColor: theme.line, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: theme.background }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setEditor(null)} accessibilityRole="button" style={[chip(false), { flex: 1, justifyContent: 'center', paddingVertical: 12 }]}>
                <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>Отмена</Text>
              </Pressable>
              <Pressable onPress={submit} disabled={!title.trim()} accessibilityRole="button" style={[chip(true), { flex: 1, justifyContent: 'center', paddingVertical: 12, opacity: title.trim() ? 1 : 0.5 }]}>
                <Text style={{ color: theme.accent, fontWeight: '800' }}>{editor?.mode === 'rename' ? 'Сохранить' : 'Создать'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menu !== null} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', padding: 14 }} onPress={() => setMenu(null)}>
          <View style={{ alignSelf: 'center', width: '100%', maxWidth: 420, borderRadius: 22, overflow: 'hidden', backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.line }}>
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700', padding: 14, paddingBottom: 6 }} numberOfLines={1}>{menu?.title}</Text>
            <Pressable
              onPress={() => { const t = menu; setMenu(null); if (t) { setTitle(t.title); setEditor({ mode: 'rename', topic: t }); } }}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15, backgroundColor: pressed ? theme.surfacePressed : 'transparent' })}
            >
              <Ionicons name="create-outline" size={20} color={theme.accent} />
              <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '600' }}>Переименовать</Text>
            </Pressable>
            <Pressable
              onPress={() => { const t = menu; setMenu(null); if (t) onDelete(t); }}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 15, backgroundColor: pressed ? theme.surfacePressed : 'transparent' })}
            >
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
              <Text style={{ color: theme.danger, fontSize: 16, fontWeight: '600' }}>Удалить топик</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
