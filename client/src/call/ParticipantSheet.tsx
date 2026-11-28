/**
 * Лист участника звонка (по нажатию на аватарку): громкость собеседника у меня 0–200 %, «заглушить у себя»,
 * а для администрации группы — «замутить у всех» / «вернуть микрофон».
 */
import React from 'react';
import { Modal, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import { Avatar } from '../components/Avatar';
import type { CallParticipantView } from './room';

/** Горизонтальный ползунок 0…max (по нажатию и перетаскиванию). */
function VolumeSlider({ value, max = 2, onChange }: { value: number; max?: number; onChange: (v: number) => void }) {
  const theme = useTheme();
  const [width, setWidth] = React.useState(1);
  const setFrom = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    const v = Math.max(0, Math.min(max, (x / width) * max));
    // Липнем к 100 % и к краям — так проще попасть в «стандартную» громкость.
    const snapped = Math.abs(v - 1) < 0.04 ? 1 : v < 0.03 ? 0 : v > max - 0.03 ? max : Math.round(v * 20) / 20;
    onChange(snapped);
  };
  const pct = Math.min(1, value / max);
  return (
    <View
      onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={setFrom}
      onResponderMove={setFrom}
      style={{ height: 44, justifyContent: 'center' }}
    >
      <View style={{ height: 8, borderRadius: 4, backgroundColor: theme.line, overflow: 'hidden' }}>
        <View style={{ width: `${pct * 100}%`, height: 8, backgroundColor: value > 1 ? theme.warning : theme.accent }} />
      </View>
      {/* Метка 100 % */}
      <View style={{ position: 'absolute', left: `${(1 / max) * 100}%`, top: 12, width: 2, height: 20, backgroundColor: theme.textDisabled, opacity: 0.6 }} />
      <View style={{ position: 'absolute', left: `${pct * 100}%`, marginLeft: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: theme.textPrimary, borderWidth: 2, borderColor: theme.accent }} />
    </View>
  );
}

export function ParticipantSheet({
  participant,
  canModerate,
  onClose,
  onVolume,
  onModMute,
}: {
  participant: CallParticipantView | null;
  /** Администратор, модератор или владелец группы в групповом звонке. */
  canModerate: boolean;
  onClose: () => void;
  onVolume: (id: string, volume: number) => void;
  onModMute: (id: string, muted: boolean) => void;
}) {
  const theme = useTheme();
  const restore = React.useRef(1);
  if (!participant) return null;
  const v = participant.volume;
  if (v > 0) restore.current = v;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 14 }} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          style={{ alignSelf: 'center', width: '100%', maxWidth: 420, borderRadius: 26, padding: 18, gap: 14, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.line }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <Avatar name={participant.name} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '800' }} numberOfLines={1}>{participant.name}</Text>
              <Text style={{ color: participant.modMuted ? theme.danger : theme.textSecondary, fontSize: 12.5, marginTop: 2 }}>
                {participant.modMuted ? 'Микрофон отключён модератором' : participant.muted ? 'Микрофон выключен' : participant.speaking ? 'Говорит' : 'В звонке'}
              </Text>
            </View>
          </View>

          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>Громкость у вас</Text>
              <Text style={{ color: v > 1 ? theme.warning : theme.textPrimary, fontSize: 13, fontWeight: '800' }}>{Math.round(v * 100)}%</Text>
            </View>
            <VolumeSlider value={v} onChange={(x) => onVolume(participant.id, x)} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.textDisabled, fontSize: 11 }}>0%</Text>
              <Text style={{ color: theme.textDisabled, fontSize: 11 }}>100%</Text>
              <Text style={{ color: theme.textDisabled, fontSize: 11 }}>200%</Text>
            </View>
          </View>

          <Pressable
            onPress={() => onVolume(participant.id, v === 0 ? restore.current : 0)}
            accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.line, backgroundColor: pressed ? theme.surfacePressed : 'transparent' })}
          >
            <Ionicons name={v === 0 ? 'volume-high' : 'volume-mute'} size={20} color={theme.accent} />
            <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '700' }}>{v === 0 ? 'Включить звук собеседника' : 'Заглушить у себя'}</Text>
          </Pressable>

          {canModerate ? (
            <Pressable
              onPress={() => onModMute(participant.id, !participant.modMuted)}
              accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: participant.modMuted ? theme.accent : theme.danger, backgroundColor: pressed ? theme.surfacePressed : 'transparent' })}
            >
              <Ionicons name={participant.modMuted ? 'mic' : 'mic-off'} size={20} color={participant.modMuted ? theme.accent : theme.danger} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: participant.modMuted ? theme.accent : theme.danger, fontSize: 15, fontWeight: '800' }}>
                  {participant.modMuted ? 'Вернуть микрофон' : 'Замутить у всех'}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11.5, marginTop: 1 }}>Действие модератора: участника не будут слышать все</Text>
              </View>
            </Pressable>
          ) : null}

          <Pressable onPress={onClose} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Готово</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
