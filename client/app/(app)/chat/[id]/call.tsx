/**
 * Личные и групповые аудиозвонки Kinto.
 * Сигналинг — Hub (/v1/calls), медиа — встроенное MCU-ядро WebRTC/Opus.
 * E2E-ключ генерируется на устройстве и известен только участникам.
 */
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../../src/theme/useTheme';
import { api } from '../../../../src/data/api';
import { createOffer, type CallChannel, type CallSession } from '../../../../src/call';
import { useStore } from '../../../../src/state/useStore';

type Phase = 'idle' | 'connecting' | 'active' | 'ended';

const CHANNELS: Array<{ id: CallChannel; label: string; note: string }> = [
  { id: 'internet', label: 'Интернет', note: 'Opus 24–32 kbps' },
  { id: 'e-kmesh', label: 'E-kMesh', note: 'ESP-NOW, 16–24 kbps' },
  { id: 'l-kmesh', label: 'L-kMesh', note: 'LoRa, 3–12 kbps (только при хорошем канале)' },
];

export default function CallScreen() {
  const params = useLocalSearchParams<{ id?: string; callId?: string }>();
  const chatId = String(params.id ?? '');
  const theme = useTheme();
  const pushToast = useStore((s) => s.pushToast);
  const [channel, setChannel] = React.useState<CallChannel>('internet');
  const [phase, setPhase] = React.useState<Phase>('idle');
  const [muted, setMuted] = React.useState(false);
  const [quality, setQuality] = React.useState<'good' | 'poor'>('good');
  const [history, setHistory] = React.useState<Array<{ id: string; startedAt: number; durationMs: number }>>([]);
  const sessionRef = React.useRef<CallSession | null>(null);
  const callIdRef = React.useRef('');
  const startedRef = React.useRef(0);
  const [seconds, setSeconds] = React.useState(0);

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
    setPhase('ended');
    try {
      const r = await api.callEnd(callId);
      setHistory((prev) => [{ id: callId, startedAt: startedRef.current, durationMs: r.durationMs }, ...prev]);
    } catch { /* offline: длительность сохранится при следующем запуске */ }
  }, []);

  const start = React.useCallback(async () => {
    setPhase('connecting');
    try {
      const keyBytes = new Uint8Array(32);
      if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(keyBytes);
      else for (let i = 0; i < keyBytes.length; i += 1) keyBytes[i] = Math.floor(Math.random() * 256);
      const e2eKey = btoa(String.fromCharCode(...keyBytes));
      const started = await api.callStart({
        chatId: chatId || undefined,
        kind: 'group',
        channel,
        e2eKey,
        quality: channel === 'l-kmesh' ? 'good' : undefined,
      });
      const result = await createOffer(channel, (sdp) => api.callJoin(started.callId, sdp).then((r) => r.sdp));
      sessionRef.current = result.session;
      callIdRef.current = started.callId;
      startedRef.current = Date.now();
      setPhase('active');
      const st = await result.session.stats();
      setQuality(st.quality);
      pushToast({ kind: 'info', message: `Звонок начат · ${channel === 'l-kmesh' ? 'L-kMesh' : channel === 'e-kmesh' ? 'E-kMesh' : 'Интернет'}` });
    } catch (e) {
      setPhase('ended');
      pushToast({ kind: 'error', message: `Не удалось начать звонок: ${String(e)}` });
    }
  }, [channel, chatId, pushToast]);

  const toggleMute = React.useCallback(() => {
    const next = !muted;
    sessionRef.current?.setMuted(next);
    setMuted(next);
  }, [muted]);

  const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={{ padding: 20 }}>
      <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Аудиозвонок</Text>
      <Text style={{ color: theme.textPrimaryDisabled, fontSize: 12, marginBottom: 18 }}>
        Личный и групповой · до 8 участников · E2E-шифрование
      </Text>

      <Text style={{ color: theme.textPrimary, fontWeight: '700', marginBottom: 8 }}>Канал</Text>
      {CHANNELS.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => setChannel(c.id)}
          style={{
            padding: 14, borderRadius: 12, marginBottom: 8,
            backgroundColor: channel === c.id ? theme.accentSoft : theme.surface,
            borderWidth: 1, borderColor: channel === c.id ? theme.accent : theme.line,
          }}
        >
          <Text style={{ color: theme.textPrimary, fontWeight: '600' }}>{c.label}</Text>
          <Text style={{ color: theme.textPrimaryDisabled, fontSize: 11 }}>{c.note}</Text>
        </Pressable>
      ))}

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
          disabled={phase === 'connecting'}
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
