/**
 * Глобальный хост звонка: владеет жизненным циклом LiveKit/kMesh-звонка. Экран можно свернуть
 * (звонок продолжается), тогда сверху на всех экранах показывается зелёная полоса 10 px
 * с названием и таймером; нажатие разворачивает звонок на весь экран.
 */
import React from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { api } from '../data/api';
import { Avatar } from '../components/Avatar';
import { useStore } from '../state/useStore';
import { useCallStore, type CallSession } from './callStore';
import { startMeshVoice, type MeshVoiceHandle } from './meshVoice';
import { supportsSpeakerToggle } from './audioSession';
import {
  joinCallRoom,
  type CallParticipantView,
  type CallPhase,
  type CallRoomHandle,
} from './room';

const ERRORS: Record<string, string> = {
  calls_unavailable: 'Звонки временно недоступны',
  call_servers_unavailable: 'Нет доступных серверов звонков. Попробуйте позже',
  call_permission_required: 'Нет права создавать звонки в этой группе',
  calls_not_allowed_in_channels: 'Звонки в каналах недоступны',
  call_ended: 'Звонок уже завершён',
  call_full: 'В звонке нет свободных мест',
  call_forbidden: 'У вас нет доступа к этому звонку',
  call_not_allowed: 'Пользователю нельзя позвонить, лучше напишите сообщение',
};

/** Самый быстрый из доступных именно этому устройству серверов звонков (часть сетей режет часть адресов). */
async function pickReachableServer(): Promise<string | undefined> {
  try {
    const { servers } = await api.callServers();
    const live = servers.filter((x) => x.enabled && x.healthy);
    if (live.length < 2) return undefined;
    const probe = (x: { id: string; domain: string }) =>
      new Promise<string | null>((resolve) => {
        const ctl = new AbortController();
        const timer = setTimeout(() => { ctl.abort(); resolve(null); }, 3500);
        fetch(`https://${x.domain}/`, { mode: 'no-cors', signal: ctl.signal, cache: 'no-store' })
          .then(() => { clearTimeout(timer); resolve(x.id); })
          .catch(() => { clearTimeout(timer); resolve(null); });
      });
    // Первый ответивший сервер выигрывает.
    return await new Promise<string | undefined>((resolve) => {
      let left = live.length;
      live.forEach((x) => void probe(x).then((id) => { if (id) resolve(id); else if (--left === 0) resolve(undefined); }));
    });
  } catch {
    return undefined;
  }
}

const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export function CallHost() {
  const session = useCallStore((st) => st.session);
  if (!session) return null;
  // key: новый звонок = новое состояние; завершённый размонтируется целиком.
  return <ActiveCall key={session.key} session={session} />;
}

function ActiveCall({ session }: { session: CallSession }) {
  const meshMode = Platform.OS !== 'web' && (session.mesh || (useStore.getState().transportOnline === false && Boolean(useStore.getState().transportModule)));
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const minimized = useCallStore((st) => st.minimized);
  const chatId = session.chatId;
  const chatType = session.chatType;
  const joinId = session.joinId;
  const title = session.title || 'Аудиозвонок';
  const barLabel = chatType === 'group' ? 'Групповой звонок' : title;
  // Кнопка «Назад» на Android сворачивает звонок, а не завершает.
  React.useEffect(() => {
    if (minimized) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      useCallStore.getState().setMinimized(true);
      return true;
    });
    return () => sub.remove();
  }, [minimized]);

  const [phase, setPhase] = React.useState<CallPhase | 'starting' | 'ended'>('starting');
  const [participants, setParticipants] = React.useState<CallParticipantView[]>([]);
  const [muted, setMuted] = React.useState(false);
  const [speaker, setSpeaker] = React.useState(Platform.OS !== 'web'); // на смартфонах по умолчанию громкая связь; выключение — разговорный динамик
  const [seconds, setSeconds] = React.useState(0);
  const [error, setError] = React.useState('');
  const roomRef = React.useRef<CallRoomHandle | null>(null);
  const meshRef = React.useRef<MeshVoiceHandle | null>(null);
  const callIdRef = React.useRef('');
  const connectedAtRef = React.useRef(0);
  const closedRef = React.useRef(false);
  const speakerRef = React.useRef(Platform.OS !== 'web');
  const isDirect = chatType === 'direct';
  const isDirectRef = React.useRef(isDirect);
  const sawPeerRef = React.useRef(false);
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
      meshRef.current?.stop();
      meshRef.current = null;
      if (id && meshMode) void api.callMeshLeave(id).catch(() => undefined);
      setActiveCallId(null);
      if (id) void api.callEnd(id).catch(() => undefined);
      void endForAll;
      if (isDirectRef.current) {
        // Личный звонок: показываем экран «Звонок завершён» 2 секунды и закрываем.
        useCallStore.getState().setMinimized(false);
        setTimeout(() => useCallStore.getState().closeCall(), 2000);
      } else {
        useCallStore.getState().closeCall();
      }
    },
    [setActiveCallId],
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
        const res = joinId ? await api.callJoin(joinId) : await api.callStart({ chatId: chatId || undefined, channel: 'internet', serverId: await pickReachableServer() });
        if (cancelled) return;
        callIdRef.current = res.callId;
        setActiveCallId(res.callId);
        useCallStore.getState().setIncoming(null);
        if (meshMode && Platform.OS !== 'web') {
          // E-kMesh: голос идёт Codec2 через модуль, комната LiveKit подключается шлюзом на сервере.
          const m = await api.callMeshJoin(res.callId);
          meshRef.current = await startMeshVoice({ callId: res.callId, ...m.mesh });
          connectedAtRef.current = Date.now();
          useCallStore.getState().setConnectedAt(connectedAtRef.current);
          setPhase('connected');
          setParticipants([{ id: 'me', name: 'Вы', local: true, speaking: false, muted: false, level: 0 }]);
          return;
        }
        const room = await joinCallRoom({
          url: res.server.url,
          token: res.token,
          onParticipants: (list) => !closedRef.current && setParticipants(list),
          onPhase: (p, reason) => {
            if (closedRef.current) return;
            if (p === 'connected' && !connectedAtRef.current) { connectedAtRef.current = Date.now(); useCallStore.getState().setConnectedAt(connectedAtRef.current); }
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
        // Применяем выбранный режим вывода сразу после подключения (по умолчанию — громкая связь).
        void room.setSpeaker(speakerRef.current);
      } catch (e) {
        if (cancelled) return;
        const code = e instanceof Error ? e.message : String(e);
        const known = Object.keys(ERRORS).find((k) => code.includes(k));
        console.warn('[call] start failed', code);
        const offline = /network|failed to fetch|timeout|abort|load failed/i.test(code);
        setError(known ? ERRORS[known] : /mesh_audio_native_unsupported/.test(code) ? 'Голос через E-kMesh на телефонах пока недоступен: используйте интернет или web-клиент' : /no_module_bound/.test(code) ? 'К аккаунту не привязан носимый модуль' : offline ? 'Нет связи с сервером. Без интернета звонок возможен через E-kMesh при подключённом носимом модуле' : Platform.OS === 'web' && /permission|NotAllowed/i.test(code) ? 'Разрешите доступ к микрофону в браузере' : `Не удалось начать звонок: ${code}`);
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
        meshRef.current?.stop();
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

  // Личный звонок: собеседник появился в комнате — запоминаем; если потом остались одни, считаем звонок сброшенным.
  React.useEffect(() => {
    if (!isDirect) return undefined;
    const others = participants.filter((p) => !p.local).length;
    if (others > 0) { sawPeerRef.current = true; return undefined; }
    if (!sawPeerRef.current || phase !== 'connected') return undefined;
    const t = setTimeout(() => { if (!closedRef.current) void leave(false); }, 1500);
    return () => clearTimeout(t);
  }, [participants, isDirect, phase, leave]);

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    await roomRef.current?.setMuted(next);
    meshRef.current?.setMuted(next);
  };
  const toggleSpeaker = async () => {
    const next = !speaker;
    setSpeaker(next);
    speakerRef.current = next;
    await roomRef.current?.setSpeaker(next);
  };

  const status =
    phase === 'starting' || phase === 'connecting'
      ? 'Соединение…'
      : phase === 'reconnecting'
        ? 'Переподключение…'
        : phase === 'connected'
          ? isDirect && !participants.some((p) => !p.local) && !sawPeerRef.current
          ? 'Ожидаем ответ собеседника'
          : fmt(seconds)
          : error || 'Звонок завершён';

  return (
    <>
      {minimized ? (
        <Pressable
          onPress={() => useCallStore.getState().setMinimized(false)}
          accessibilityRole="button"
          accessibilityLabel="Вернуться к звонку"
          style={[styles.bar, { top: insets.top }]}
        >
          <Text style={styles.barText} numberOfLines={1}>
            {barLabel}{phase === 'connected' ? `  ·  ${fmt(seconds)}` : phase === 'ended' ? '  ·  завершён' : '  ·  соединение…'}
          </Text>
        </Pressable>
      ) : null}
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }, minimized ? styles.hidden : null]} pointerEvents={minimized ? 'none' : 'auto'}>
      <Pressable
        onPress={() => useCallStore.getState().setMinimized(true)}
        accessibilityRole="button"
        accessibilityLabel="Свернуть звонок"
        style={[styles.minBtn, { top: insets.top + 12, backgroundColor: theme.surfaceElevated }]}
      >
        <Ionicons name="chevron-down" size={22} color={theme.textPrimary} />
      </Pressable>
      <View style={styles.header}>
        <Text style={{ color: theme.textPrimary, fontSize: 22, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: phase === 'reconnecting' || error ? theme.warning : theme.accent, fontSize: 16, marginTop: 6 }}>{status}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>{meshMode ? 'E-kMesh · Codec2 3200 бит/с' : 'Интернет · WebRTC · Opus'}</Text>
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
            accessibilityLabel={speaker ? "Выключить громкую связь (разговорный динамик)" : "Включить громкую связь"}
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
    </>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9990, elevation: 9990 },
  hidden: { display: 'none' },
  bar: { position: 'absolute', left: 0, right: 0, height: 10, backgroundColor: '#22C55E', zIndex: 9999, elevation: 9999, alignItems: 'center', justifyContent: 'center' },
  barText: { color: '#04210F', fontSize: 9, lineHeight: 10, fontWeight: '800', maxWidth: '90%' },
  minBtn: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  header: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', padding: 24, gap: 18 },
  cell: { width: 112, alignItems: 'center' },
  ring: { borderWidth: 3, borderRadius: 999, padding: 3 },
  mutedBadge: { position: 'absolute', right: 0, bottom: 0, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingHorizontal: 24 },
  btn: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
});
