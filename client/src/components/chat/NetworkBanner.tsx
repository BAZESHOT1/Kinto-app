import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MotiView } from 'moti';
import { useTheme } from '../../theme/useTheme';
import { useReducedMotion } from '../useReducedMotion';
import { ConnectionIndicator, type ConnectionPhase } from '../ConnectionStatus';

/**
 * Тонкая плашка над композером: «Соединение» / «Обновление» с анимацией.
 * Показывается только когда связи нет или идёт досинхронизация, и не
 * отвлекает подробностями (без счётчиков попыток).
 */
export function NetworkBanner({ phase }: { phase: ConnectionPhase }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = React.useState(Boolean(phase));
  const active = phase === 'connecting' || phase === 'updating';

  React.useEffect(() => {
    if (active) {
      setMounted(true);
      return undefined;
    }
    const t = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(t);
  }, [active]);

  if (!mounted || !phase) return null;

  return (
    <MotiView
      from={reduced ? { opacity: 1 } : { opacity: 0, translateY: -6 }}
      animate={{ opacity: active ? 1 : 0, translateY: active ? 0 : -4 }}
      transition={{ type: 'timing', duration: 200 }}
      style={[styles.banner, { backgroundColor: theme.warningSoft, borderColor: theme.warning }]}
    >
      <ConnectionIndicator phase={phase} />
    </MotiView>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
