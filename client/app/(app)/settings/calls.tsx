/**
 * «Звонки и звук»: шумоподавление, эхоподавление, автоусиление, усиление микрофона, выбор микрофона и
 * «студийная» обработка голоса. Настройки хранятся на устройстве и применяются сразу, в том числе во время звонка.
 */
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '../../../src/theme/useTheme';
import {
  GlassCard,
  SettingsPage,
  SettingsSection,
  SettingsToggle,
} from '../../../src/components/settings/SettingsUI';
import { useAudioPrefs } from '../../../src/call/audioPrefs';

const GAINS = [0.5, 0.75, 1, 1.5, 2, 3];

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? theme.accent : theme.line,
        backgroundColor: selected ? theme.accentSoft : 'transparent',
      }}
    >
      <Text style={{ color: selected ? theme.accent : theme.textPrimary, fontWeight: '700', fontSize: 13.5 }}>{label}</Text>
    </Pressable>
  );
}

/** Список микрофонов (web/Windows). Подписи устройств браузер показывает только после разрешения на микрофон. */
function useMicDevices(): { devices: { id: string; label: string }[]; ask: () => void; supported: boolean } {
  const [devices, setDevices] = React.useState<{ id: string; label: string }[]>([]);
  const supported = Platform.OS === 'web' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.enumerateDevices);
  const refresh = React.useCallback(async () => {
    if (!supported) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Микрофон ${i + 1}` })));
    } catch {
      /* нет доступа */
    }
  }, [supported]);
  React.useEffect(() => {
    void refresh();
    if (!supported) return undefined;
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
  }, [refresh, supported]);
  const ask = React.useCallback(() => {
    if (!supported) return;
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        return refresh();
      })
      .catch(() => undefined);
  }, [refresh, supported]);
  return { devices, ask, supported };
}

export default function CallsSoundScreen() {
  const theme = useTheme();
  const prefs = useAudioPrefs();
  const { devices, ask, supported } = useMicDevices();
  const desktop = Platform.OS === 'web';

  return (
    <SettingsPage title="Звонки и звук" subtitle="Микрофон, шумо- и эхоподавление, усиление">
      <SettingsSection title="Обработка голоса" delay={0}>
        <GlassCard>
          <SettingsToggle
            icon="sparkles-outline"
            title="Шумоподавление"
            subtitle={desktop ? 'Браузерное шумоподавление (WebRTC)' : Platform.OS === 'ios' ? 'WebRTC + системный режим voiceChat' : 'WebRTC + системное шумоподавление Android'}
            value={prefs.noiseSuppression}
            onValueChange={(v) => prefs.set({ noiseSuppression: v })}
          />
          <SettingsToggle
            icon="ear-outline"
            title="Эхоподавление"
            subtitle="Убирает эхо динамика в микрофоне; полезно без наушников"
            value={prefs.echoCancellation}
            onValueChange={(v) => prefs.set({ echoCancellation: v })}
          />
          <SettingsToggle
            icon="trending-up-outline"
            title="Автоусиление (AGC)"
            subtitle="Автоматически выравнивает громкость; при включении голос может звучать «плоско»"
            value={prefs.autoGainControl}
            onValueChange={(v) => prefs.set({ autoGainControl: v })}
          />
          {desktop ? (
            <SettingsToggle
              icon="musical-notes-outline"
              title="Обработка голоса"
              subtitle="Фильтр гула, мягкая компрессия, чёткость: чище и объёмнее звук"
              value={prefs.voiceChain}
              onValueChange={(v) => prefs.set({ voiceChain: v })}
            />
          ) : null}
        </GlassCard>
      </SettingsSection>

      {desktop ? (
        <SettingsSection title="Усиление микрофона" delay={40}>
          <GlassCard>
            <View style={{ padding: 14, gap: 10 }}>
              <Text style={{ color: theme.textSecondary, fontSize: 12.5 }}>Множитель громкости вашего голоса для собеседников</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {GAINS.map((g) => (
                  <Chip key={g} label={`×${g}`} selected={Math.abs(prefs.micGain - g) < 0.01} onPress={() => prefs.set({ micGain: g })} />
                ))}
              </View>
            </View>
          </GlassCard>
        </SettingsSection>
      ) : (
        <SettingsSection title="Усиление микрофона" delay={40}>
          <GlassCard>
            <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18, padding: 14 }}>
              На iOS и Android громкость микрофона задаёт система и аппаратная обработка звонка; ручное усиление доступно в web и Windows. Для выравнивания громкости включите автоусиление.
            </Text>
          </GlassCard>
        </SettingsSection>
      )}

      <SettingsSection title="Микрофон" delay={80}>
        <GlassCard>
          {supported ? (
            <View style={{ padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="По умолчанию" selected={!prefs.micDeviceId} onPress={() => prefs.set({ micDeviceId: '' })} />
                {devices.map((d) => (
                  <Chip key={d.id} label={d.label} selected={prefs.micDeviceId === d.id} onPress={() => prefs.set({ micDeviceId: d.id })} />
                ))}
              </View>
              {devices.every((d) => /^Микрофон \d+$/.test(d.label)) ? (
                <Pressable onPress={ask} accessibilityRole="button">
                  <Text style={{ color: theme.accent, fontWeight: '700', fontSize: 13 }}>Показать названия устройств (нужен доступ к микрофону)</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18, padding: 14 }}>
              На iOS и Android микрофон выбирает система: гарнитура или Bluetooth подключаются автоматически, а вывод звука переключается кнопкой громкой связи в звонке.
            </Text>
          )}
        </GlassCard>
      </SettingsSection>
    </SettingsPage>
  );
}
