/**
 * Экран аудиозвонка (личный чат и группа, до 8 участников).
 *
 * Медиа — LiveKit (WebRTC/Opus). Сервер звонка выбирает Hub (POST /v1/calls/start) и возвращает его
 * адрес: голосовой трафик идёт напрямую на домен этого сервера, а не через основной API-домен.
 * Входящий звонок открывает этот же экран с параметром callId (POST /v1/calls/:id/join).
 */
import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../../src/theme/useTheme';
import { api } from '../../../../src/data/api';
import { Avatar } from '../../../../src/components/Avatar';
import { useStore } from '../../../../src/state/useStore';
import { useCallStore } from '../../../../src/call/callStore';
import { supportsSpeakerToggle } from '../../../../src/call/audioSession';
import {
  joinCallRoom,
  type CallParticipantView,
  type CallPhase,
  type CallRoomHandle,
} from '../../../../src/call/room';

const ERRORS: Record<string, string> = {
  calls_unavailable: 'Звонки временно недоступны',
  call_servers_unavailable: 'Нет доступных серверов звонков. Попробуйте позже',
  call_permission_required: 'Нет права создавать звонки в этой группе',
  calls_not_allowed_in_channels: 'Звонки в каналах недоступны',
  call_ended: 'Звонок уже завершён',
  call_full: 'В звонке нет свободных мест',
  call_forbidden: 'У вас нет доступа к этому звонку',
};

const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export default function CallScreen() {
  const params = useLocalSearchParams<{ id?: string; type?: string; callId?: string; title?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const pushToast = useStore((s) => s.pushToast);
  const chatId = params.id && params.id !== 'x' ? String(params.id) : '';
  const chatType = String(params.type ?? '');
  const joinId = typeof params.callId === 'string' ? params.callId : '';
  const title = typeof params.title === 'string' && params.title ? params.title : 'Аудиозвонок';

  const [phase, setPhase] = React.useState<CallPhase | 'starting' | 'ended'>('starting');
  const [participants, setParticipants] = React.useState<CallParticipantView[]>([]);
  const [muted, setMuted] = React.useState(false);
  const [speaker, setSpeaker] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);
  const [error, setError] = React.useState('');
  const roomRef = React.useRef<CallRoomHandle | null>(null);
  const callIdRef = React.useRef('');
  const connectedAtRef = React.useRef(0);
  const closedRef = React.useRef(false);
  const setActiveCallId = useCallStore((s) => s.setActiveCallId);
  const activeCallId = useCallStore((s) => s.activeCallId);

  const leave = React.useCallback(
    async (endForAll: boolean) => {
      if (closedRef.current) return;
      closedRef.current = true;
      setPhase('ended');
      const id = callIdRef.current;
      await roomRef.current?.disconnect();
      roomRef.current = null;
      setActiveCallId(null);
      if (id) void api.callEnd(id).catch(() => undefined);
      void endForAll;
      if (router.canGoBack()) router.back();
      else router.replace('/chats' as never);
    },
    [router, setActiveCallId],
  );

  // Запуск: исходящий звонок (start) или вход в чужой (join). Hub возвращает сервер и токен.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (chatType === 'channel') {
        setError('Звонки в каналах недоступны');
        setPhase('ended');
        return;
      }
      try {
        const res = joinId ? await api.callJoin(joinId) : await api.callStart({ chatId: chatId || undefined, channel: 'internet' });
        if (cancelled) return;
        callIdRef.current = res.callId;
        setActiveCallId(res.callId);
        useCallStore.getState().setIncoming(null);
        const room = await joinCallRoom({
          url: res.server.url,
          token: res.token,
          onParticipants: (list) => !closedRef.current && setParticipants(list),
          onPhase: (p, reason) => {
            if (closedRef.current) return;
            if (p === 'connected' && !connectedAtRef.current) connectedAtRef.current = Date.now();
            if (p === 'disconnected') {
              if (reason) console.warn('[call] disconnected', reason);
              void leave(false);
              return;
            }
            setPhase(p);
          },
        });
        if (cancelled) {
          await room.disconnect();
          return;
        }
        roomRef.current = room;
      } catch (e) {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : String(e);
        const known = Object.keys(ERRORS).find((k) => code.includes(k));
        console.warn('[call] start failed', code);
        const offline = /network|failed to fetch|timeout|abort|load failed/i.test(code);
        setError(known ? ERRORS[known] : offline ? 'Нет связи с сервером. Без интернета звонок возможен через E-kMesh при подключённом носимом модуле' : Platform.OS === 'web' && /permission|NotAllowed/i.test(code) ? 'Разрешите доступ к микрофону в браузере' : `Не удалось начать звонок: ${code}`);
        setPhase('ended');
        if (callIdRef.current) void api.callEnd(callIdRef.current).catch(() => undefined);
        setActiveCallId(null);
      }
    })();
    return () => {
      cancelled = true;
      if (!closedRef.current) {
        closedRef.current = true;
        void roomRef.current?.disconnect();
        const id = callIdRef.current;
        setActiveCallId(null);
        if (id) void api.callEnd(id).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сервер завершил звонок (владелец или пустая комната) — выходим.
  React.useEffect(() => {
    if (callIdRef.current && activeCallId === null && !closedRef.current && phase !== 'starting') void leave(false);
  }, [activeCallId, leave, phase]);

  React.useEffect(() => {
    if (phase !== 'connected') return undefined;
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - connectedAtRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    await roomRef.current?.setMuted(next);
  };
  const toggleSpeaker = async () => {
    const next = !speaker;
    setSpeaker(next);
    await roomRef.current?.setSpeaker(next);
  };

  const status =
    phase === 'starting' || phase === 'connecting'
      ? 'Соединение…'
      : phase === 'reconnecting'
        ? 'Переподключение…'
        : phase === 'connected'
          ? fmt(seconds)
          : error || 'Звонок завершён';

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={{ color: theme.textPrimary, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: phase === 'reconnecting' || error ? theme.warning : theme.accent, fontSize: 16, marginTop: 6 }}>{status}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>Интернет · WebRTC · Opus</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {participants.map((p) => (
          <View key={p.id} style={styles.cell}>
            <View
              style={[
                styles.ring,
                { borderColor: p.speaking ? theme.accent : 'transparent', transform: [{ scale: p.speaking ? 1.04 : 1 }] },
              ]}
            >
              <Avatar name={p.name} size={84} />
              {p.muted ? (
                <View style={[styles.mutedBadge, { backgroundColor: theme.surfaceElevated }]}>
                  <Ionicons name="mic-off" size={14} color={theme.textSecondary} />
                </View>
              ) : null}
            </View>
            <Text style={{ color: theme.textPrimary, marginTop: 8, fontSize: 14 }} numberOfLines={1}>
              {p.local ? 'Вы' : p.name}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.controls}>
        <Pressable
          onPress={() => void toggleMute()}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Включить микрофон' : 'Выключить микрофон'}
          style={[styles.btn, { backgroundColor: muted ? theme.textPrimary : theme.surfaceElevated }]}
        >
          <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color={muted ? theme.background : theme.textPrimary} />
        </Pressable>
        {supportsSpeakerToggle ? (
          <Pressable
            onPress={() => void toggleSpeaker()}
            accessibilityRole="button"
            accessibilityLabel="Громкая связь"
            style={[styles.btn, { backgroundColor: speaker ? theme.textPrimary : theme.surfaceElevated }]}
          >
            <Ionicons name="volume-high" size={26} color={speaker ? theme.background : theme.textPrimary} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void leave(true)}
          accessibilityRole="button"
          accessibilityLabel="Завершить звонок"
          style={[styles.btn, { backgroundColor: theme.danger }]}
        >
          <Ionicons name="call" size={26} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 24, paddingBottom: 28 },
  header: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', padding: 24, gap: 18 },
  cell: { width: 112, alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: 999, padding: 3 },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingHorizontal: 24 },
  btn: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
});
