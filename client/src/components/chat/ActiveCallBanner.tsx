/** Плашка «Идёт звонок» под шапкой диалога: пульсирующий индикатор, живой таймер, число участников и кнопка входа. */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useTheme } from '../../theme/useTheme';
import { Glass } from '../Glass';

const GREEN = '#22C55E';
const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export function ActiveCallBanner({
  startedAt,
  participants,
  inCall,
  onPress,
}: {
  startedAt: number;
  participants: number;
  /** Пользователь уже в этом звонке (на этом устройстве). */
  inCall: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={inCall ? 'Вернуться к звонку' : 'Присоединиться к звонку'} style={{ marginHorizontal: 12, marginTop: 6 }}>
      <Glass radius={20} fill="rgba(34,197,94,0.14)" borderColor="rgba(34,197,94,0.45)" style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 12 }}>
        <View style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}>
          <MotiView
            from={{ scale: 0.7, opacity: 0.55 }}
            animate={{ scale: 1.35, opacity: 0 }}
            transition={{ type: 'timing', duration: 1400, loop: true }}
            style={{ position: 'absolute', width: 38, height: 38, borderRadius: 19, backgroundColor: GREEN }}
          />
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="call" size={17} color="#04210F" />
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: theme.textPrimary, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>Идёт звонок</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 1 }} numberOfLines={1}>
            {fmt(now - startedAt)} · {participants} {participants === 1 ? 'участник' : 'участн.'}
          </Text>
        </View>
        <View style={{ backgroundColor: GREEN, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 }}>
          <Text style={{ color: '#04210F', fontWeight: '800', fontSize: 13.5 }}>{inCall ? 'Вернуться' : 'Войти'}</Text>
        </View>
      </Glass>
    </Pressable>
  );
}
