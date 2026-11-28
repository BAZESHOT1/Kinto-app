/**
 * Звук звонка — всё в одном листе на экране звонка: громкость вашего микрофона 0–200 %, выбор микрофона,
 * шумо- и эхоподавление, автоусиление и обработка голоса. Изменения применяются сразу и запоминаются на устройстве.
 */
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import { useAudioPrefs } from './audioPrefs';
import { VolumeSlider } from './ParticipantSheet';

function Row({ icon, title, hint, value, onChange }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
      <Ionicons name={icon} size={20} color={theme.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 11.5, marginTop: 1 }}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.accent, false: theme.line }} />
    </View>
  );
}

/** Список микрофонов (web/Windows). Названия устройств браузер показывает только после разрешения на микрофон. */
function useMicDevices() {
  const [devices, setDevices] = React.useState<{ id: string; label: string }[]>([]);
  const supported = Platform.OS === 'web' && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.enumerateDevices);
  const refresh = React.useCallback(async () => {
    if (!supported) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d, i) => ({ id: d.deviceId, label: d.label || `Микрофон ${i + 1}` })));
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
  return { devices, supported };
}

export function CallAudioSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const theme = useTheme();
  const prefs = useAudioPrefs();
  const { devices, supported } = useMicDevices();
  const web = Platform.OS === 'web';
  const gainHint = web
    ? 'Множитель громкости вашего голоса для собеседников'
    : 'На телефоне усиление выполняет системное автоусиление: выше 125 % оно включается';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', padding: 14 }} onPress={onClose}>
        <Pressable
          onPress={() => undefined}
          style={{ alignSelf: 'center', width: '100%', maxWidth: 460, maxHeight: '88%', borderRadius: 26, backgroundColor: theme.surfaceElevated, borderWidth: 1, borderColor: theme.line }}
        >
          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: theme.textPrimary, fontSize: 19, fontWeight: '800' }}>Звук звонка</Text>

            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700' }}>Громкость вашего микрофона</Text>
                <Text style={{ color: prefs.micGain > 1 ? theme.warning : theme.textPrimary, fontSize: 13, fontWeight: '800' }}>{Math.round(prefs.micGain * 100)}%</Text>
              </View>
              <VolumeSlider value={prefs.micGain} onChange={(v) => prefs.set({ micGain: v })} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: theme.textDisabled, fontSize: 11 }}>0%</Text>
                <Text style={{ color: theme.textDisabled, fontSize: 11 }}>100%</Text>
                <Text style={{ color: theme.textDisabled, fontSize: 11 }}>200%</Text>
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5, marginTop: 4 }}>{gainHint}</Text>
            </View>

            <View>
              <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8 }}>Микрофон</Text>
              {supported ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[{ id: '', label: 'По умолчанию' }, ...devices].map((d) => {
                    const sel = prefs.micDeviceId === d.id;
                    return (
                      <Pressable
                        key={d.id || 'default'}
                        onPress={() => prefs.set({ micDeviceId: d.id })}
                        accessibilityRole="button"
                        style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: sel ? theme.accent : theme.line, backgroundColor: sel ? theme.accentSoft : 'transparent' }}
                      >
                        <Text style={{ color: sel ? theme.accent : theme.textPrimary, fontWeight: '700', fontSize: 13.5 }} numberOfLines={1}>{d.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                  На iOS и Android микрофон выбирает система: гарнитура или Bluetooth подключаются автоматически, а вывод звука переключается кнопкой громкой связи.
                </Text>
              )}
            </View>

            <View>
              <Row icon="sparkles-outline" title="Шумоподавление" hint="Убирает фоновый шум" value={prefs.noiseSuppression} onChange={(v) => prefs.set({ noiseSuppression: v })} />
              <Row icon="ear-outline" title="Эхоподавление" hint="Убирает эхо динамика в микрофоне" value={prefs.echoCancellation} onChange={(v) => prefs.set({ echoCancellation: v })} />
              <Row icon="trending-up-outline" title="Автоусиление (AGC)" hint="Выравнивает громкость; голос может звучать «плоско»" value={prefs.autoGainControl} onChange={(v) => prefs.set({ autoGainControl: v })} />
              {web ? (
                <Row icon="musical-notes-outline" title="Обработка голоса" hint="Фильтр гула, мягкая компрессия, чёткость" value={prefs.voiceChain} onChange={(v) => prefs.set({ voiceChain: v })} />
              ) : null}
            </View>

            <Pressable onPress={onClose} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 15 }}>Готово</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
