/** Глобальный индикатор соединения: «Соединение» / «Обновление». */
import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import { useReducedMotion } from './useReducedMotion';
import { useStore } from '../state/useStore';

export type ConnectionPhase = 'connecting' | 'updating' | 'mesh' | null;

// Глобально между экранами: открытие чата не должно снова показывать «Обновление».
let lastOnline: boolean | null = null;

export function useConnectionPhase(): ConnectionPhase {
  const online = useStore((s) => s.transportOnline);
  const mesh = useStore((s) => s.transportModule);
  const [updating, setUpdating] = React.useState(false);

  React.useEffect(() => {
    const previous = lastOnline;
    lastOnline = online;
    if (!online) {
      setUpdating(false);
      return undefined;
    }
    // Показываем «Обновление» только при реальном переходе offline → online.
    if (previous === false) {
      setUpdating(true);
      const timer = setTimeout(() => setUpdating(false), 1600);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [online]);

  // Модуль подключён — канал mesh валиден, даже если интернета нет.
  if (!online) return mesh ? 'mesh' : 'connecting';
  if (updating) return 'updating';
  return null;
}

export const CONNECTION_LABEL: Record<'connecting' | 'updating' | 'mesh', string> = {
  connecting: 'Соединение',
  updating: 'Обновление',
  mesh: 'Модуль',
};

/**
 * Компактный анимированный индикатор состояния: три пульсирующие точки и
 * короткая подпись («Соединение», «Обновление»). Используется в шапке чата,
 * вместо поиска в списке чатов и в баннере над композером.
 */
export function ConnectionIndicator({
  phase,
  size = 'normal',
}: {
  phase: ConnectionPhase;
  size?: 'normal' | 'large';
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [dot, setDot] = React.useState(0);
  React.useEffect(() => {
    if (!phase || reduced) return undefined;
    const timer = setInterval(() => setDot((n) => (n + 1) % 3), 420);
    return () => clearInterval(timer);
  }, [phase, reduced]);

  if (!phase) return null;
  const color = phase === 'connecting' ? theme.warning : theme.accent;
  const icon = phase === 'connecting' ? 'cloud-offline-outline' : phase === 'mesh' ? 'radio-outline' : 'sync-outline';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: size === 'large' ? 8 : 6,
        minWidth: 0,
      }}
      accessibilityLiveRegion="polite"
      accessibilityLabel={CONNECTION_LABEL[phase]}
    >
      <Ionicons name={icon} size={size === 'large' ? 15 : 13} color={color} />
      <Text
        numberOfLines={1}
        style={{
          color,
          fontSize: size === 'large' ? 17 : 13.5,
          fontWeight: '800',
          letterSpacing: 0.1,
        }}
      >
        {CONNECTION_LABEL[phase]}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              width: size === 'large' ? 5 : 4,
              height: size === 'large' ? 5 : 4,
              borderRadius: 3,
              backgroundColor: color,
              opacity: reduced ? 0.5 : dot === i ? 1 : 0.25,
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function ConnectionPill({ phase }: { phase: ConnectionPhase }) {
  const theme = useTheme();
  if (!phase) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: phase === 'connecting' ? theme.warningSoft : theme.accentSoft,
      }}
    >
      <Ionicons
        name={phase === 'connecting' ? 'cloud-offline-outline' : phase === 'mesh' ? 'radio-outline' : 'sync-outline'}
        size={12}
        color={phase === 'connecting' ? theme.warning : theme.accent}
      />
      <Text style={{ color: phase === 'connecting' ? theme.warning : theme.accent, fontSize: 11, fontWeight: '700' }}>
        {CONNECTION_LABEL[phase]}
      </Text>
    </View>
  );
}
