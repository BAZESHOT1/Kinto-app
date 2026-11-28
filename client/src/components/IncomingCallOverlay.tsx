/**
 * Входящий аудиозвонок: карточка сверху поверх любого экрана, вибрация, «Принять» / «Отклонить».
 * Принятие открывает экран звонка с callId — Hub выдаёт адрес сервера, где идёт звонок.
 */
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useTheme } from '../theme/useTheme';
import { useCallStore } from '../call/callStore';
import { Avatar } from './Avatar';

const RING_TIMEOUT_MS = 45_000;

export function IncomingCallOverlay() {
  const theme = useTheme();
  const router = useRouter();
  const incoming = useCallStore((s) => s.incoming);
  const setIncoming = useCallStore((s) => s.setIncoming);

  React.useEffect(() => {
    if (!incoming) return undefined;
    if (Platform.OS !== 'web') Vibration.vibrate([0, 600, 500], true);
    const timer = setTimeout(() => setIncoming(null), RING_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      if (Platform.OS !== 'web') Vibration.cancel();
    };
  }, [incoming, setIncoming]);

  if (!incoming) return null;

  const accept = () => {
    const call = incoming;
    setIncoming(null);
    router.push({
      pathname: `/chat/${call.chatId ?? 'x'}/call`,
      params: { callId: call.callId, title: call.fromName, type: call.kind },
    } as never);
  };

  return (
    <MotiView
      from={{ opacity: 0, translateY: -24 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 240 }}
      style={[styles.wrap, { backgroundColor: theme.surfaceElevated, borderColor: theme.line }]}
      pointerEvents="box-none"
    >
      <Avatar name={incoming.fromName} size={46} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.textPrimary, fontWeight: '800', fontSize: 16 }}>{incoming.fromName}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12.5 }}>
          {incoming.kind === 'group' ? 'Групповой звонок' : 'Входящий звонок'}
        </Text>
      </View>
      <Pressable onPress={() => setIncoming(null)} accessibilityRole="button" accessibilityLabel="Отклонить" style={[styles.btn, { backgroundColor: theme.danger }]}>
        <Ionicons name="call" size={22} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
      </Pressable>
      <Pressable onPress={accept} accessibilityRole="button" accessibilityLabel="Принять" style={[styles.btn, { backgroundColor: theme.success }]}>
        <Ionicons name="call" size={22} color="#fff" />
      </Pressable>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 9999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  btn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
