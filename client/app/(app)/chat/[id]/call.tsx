/**
 * Личные и групповые аудиозвонки Kinto.
 * Канал выбирается автоматически: интернет, при отсутствии — kMesh через носимый модуль.
 * Сигналинг — Hub (/v1/calls), медиа — PCM-микшер Go/Pion с E2E-ключом.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../../src/theme/useTheme';
import { api } from '../../../../src/data/api';
import { createOffer, type CallChannel, type CallSession } from '../../../../src/call';
import { startMeshAudio } from '../../../../src/call/meshAudio.web';
import { useStore } from '../../../../src/state/useStore';
import { useModuleConnection } from '../../../../src/modules/ModuleProvider';

type Phase = 'idle' | 'connecting' | 'active' | 'ended';

const LABEL: Record<CallChannel, string> = {
  internet: 'Интернет · Opus 24–32 kbps',
  'e-kmesh': 'E-kMesh · ESP-NOW 16–24 kbps',
  'l-kmesh': 'L-kMesh · LoRa 3–12 kbps',
};

export default function CallScreen() {
  const params = useLocalSearchParams<{ id?: string; type?: string }>();
  const chatId = String(params.id ?? '');
  const chatType = String(params.type ?? '');
  const theme = useTheme();
  const pushToast = useStore((s) => s.pushToast);
  const transportOnline = useStore((s) => s.transportOnline);
  const { info, connected } = useModuleConnection();
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [muted, setMuted] = React.useState(false);
  const [quality, setQuality] = React.useState<'good' | 'poor'>('good');
  const [history, setHistory] = React.useState<Array<{ id: string; startedAt: number; durationMs: number }>>([]);
  const sessionRef = React.useRef<CallSession | null>(null);
  const meshAudioRef = React.useRef<{ stop: () => void } | null>(null);
  const callIdRef = React.useRef('');
  const startedRef = React.useRef(0);
  const [seconds, setSeconds] = React.useState(0);

  // Канал по умолчанию: интернет; без интернета — kMesh через носимый модуль.
  const channel: CallChannel = transportOnline
    ? 'internet'
    : (Number(info?.hw?.lb ?? 0) > 0 ? 'l-kmesh' : 'e-kmesh');
  const meshAvailable = transportOnline || (connected && Boolean(info?.gateway));

  React.useEffect(() => {
    let mounted = true;
    void api.callHistory(chatId || undefined, 20).then((r) => {
      if (mounted) setHistory(r.calls ?? []);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [chatId]);

  React.useEffect(() => {
    if (phase !== 'active') return;
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedRef.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const finish = React.useCallback(async (callId: string) => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    meshAudioRef.current?.stop();
    meshAudioRef.current = null;
    setPhase('ended');
    try {
      const r = await api.callEnd(callId);
      setHistory((prev) => [{ id: callId, startedAt: startedRef.current, durationMs: r.durationMs }, ...prev]);
    } catch { /* offline: длительность сохранится при следующем запуске */ }
  }, []);

  const start = React.useCallback(async () => {
    if (chatType === 'channel') {
      pushToast({ kind: 'error', message: 'Звонки в каналах недоступны' });
      return;
    }
    if (!meshAvailable) {
      pushToast({ kind: 'error', message: 'Нет интернета и доступа к Hub через носимый модуль' });
      return;
    }
    setPhase('connecting');
    try {
      const keyBytes = new Uint8Array(32);
      if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(keyBytes);
      else for (let i = 0; i < keyBytes.length; i += 1) keyBytes[i] = Math.floor(Math.random() * 256);
      const e2eKey = btoa(String.fromCharCode(...keyBytes));
      const started = await api.callStart({
        chatId: chatId || undefined,
        kind: chatId ? 'group' : 'direct',
        channel,
        e2eKey,
        quality: channel === 'l-kmesh' ? 'good' : undefined,
      });
      if (channel === 'internet') {
        const result = await createOffer(channel, (sdp) => api.callJoin(started.callId, sdp).then((r) => r.sdp));
        sessionRef.current = result.session;
      } else {
        // E-kMesh: сигналинг уже прошёл через kMesh; аудио идёт Opus-кадрами по kMesh.
        meshAudioRef.current = await startMeshAudio(started.roomId);
      }
      callIdRef.current = started.callId;
      startedRef.current = Date.now();
      setPhase('active');
      const st = sessionRef.current ? await sessionRef.current.stats() : { quality: 'good' as const };
      setQuality(st.quality);
      pushToast({ kind: 'info', message: `Звонок начат · ${LABEL[channel]}` });
    } catch (e) {
      setPhase('ended');
      const msg = String(e);
      pushToast({ kind: 'error', message: msg.includes('permission') ? 'Нет права создавать звонки в этой группе' : `Не удалось начать звонок: ${msg}` });
    }
  }, [chatType, meshAvailable, chatId, channel, pushToast]);

  const toggleMute = React.useCallback(() => {
    const next = !muted;
    sessionRef.current?.setMuted(next);
    setMuted(next);
  }, [muted]);

  const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  if (chatType === 'channel') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 20 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '700' }}>Звонки в каналах недоступны</Text>
        <Text style={{ color: theme.textPrimaryDisabled, fontSize: 13, marginTop: 8 }}>
          Аудиозвонки работают в личных сообщениях и группах.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 20 }}>
      <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Аудиозвонок</Text>
      <Text style={{ color: theme.textPrimaryDisabled, fontSize: 12, marginBottom: 18 }}>
        {LABEL[channel]} · до 8 участников · E2E-шифрование
      </Text>
      {!transportOnline ? (
        <Text style={{ color: theme.textPrimaryDisabled, fontSize: 12, marginBottom: 12 }}>
          Интернет недоступен — сигналинг идёт через kMesh и носимый модуль. Медиа доставляется через Hub.
        </Text>
      ) : null}

      {phase === 'active' ? (
        <View style={{ marginTop: 22, alignItems: 'center' }}>
          <Text style={{ color: theme.accent, fontSize: 34, fontWeight: '800' }}>{fmt(seconds)}</Text>
          <Text style={{ color: quality === 'good' ? theme.accent : '#F88011', marginTop: 4 }}>
            {quality === 'good' ? 'Канал хороший' : 'Канал перегружен — снижаем битрейт'}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <Pressable onPress={toggleMute} style={{ padding: 14, borderRadius: 12, backgroundColor: theme.surface }}>
              <Ionicons name={muted ? 'mic-off' : 'mic'} size={22} color={theme.textPrimary} />
            </Pressable>
            <Pressable onPress={() => void finish(callIdRef.current)} style={{ padding: 14, borderRadius: 12, backgroundColor: theme.danger }}>
              <Ionicons name="call-end" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => void start()}
          disabled={phase === 'connecting' || !meshAvailable}
          style={{ marginTop: 22, padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: theme.accent }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {phase === 'connecting' ? 'Подключение…' : 'Начать звонок'}
          </Text>
        </Pressable>
      )}

      {history.length > 0 ? (
        <View style={{ marginTop: 28 }}>
          <Text style={{ color: theme.textPrimary, fontWeight: '700', marginBottom: 8 }}>История звонков</Text>
          {history.slice(0, 12).map((h) => (
            <View key={h.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.line }}>
              <Text style={{ color: theme.textPrimaryDisabled, fontSize: 12 }}>{new Date(h.startedAt).toLocaleString()}</Text>
              <Text style={{ color: theme.textPrimary, fontSize: 12 }}>{fmt(Math.round(h.durationMs / 1000))}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
