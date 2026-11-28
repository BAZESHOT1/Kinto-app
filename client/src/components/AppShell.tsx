import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { useIsWide } from '../theme/useIsWide';
import { useLayoutInsets, type LayoutInsets } from '../theme/useLayoutInsets';
import { SCREEN_X, WIDE_RIGHT_X, spacing } from '../theme/layout';
import { AppNavbar, SIDEBAR_WIDTH } from './AppNavbar';
import { SuspendedOverlay } from './SuspendedOverlay';

export type ShellMetrics = {
  insets: LayoutInsets;
  wide: boolean;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
};

const ShellMetricsContext = React.createContext<ShellMetrics | null>(null);

/** Метрики оболочки — единственный источник для экранов, которым нужен full bleed. */
export function useShellMetrics(): ShellMetrics {
  const metrics = React.useContext(ShellMetricsContext);
  if (!metrics) throw new Error('useShellMetrics must be used inside AppShell');
  return metrics;
}

/**
 * Каркас приложения. Отступы НЕ зависят от pathname — это критично для
 * плавности переходов. Safe-area приходит из одного источника: CSS на web
 * и SafeAreaProvider на native (useLayoutInsets).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const insets = useLayoutInsets();
  const wide = useIsWide();
  const theme = useTheme();

  const paddingLeft = wide ? (insets.left || 0) + SIDEBAR_WIDTH + 24 : SCREEN_X;
  const paddingRight = wide ? WIDE_RIGHT_X : SCREEN_X;
  // Верхний отступ: на широком вебе фиксированные 24, на мобильном — safe-area (0 на вебе, там CSS env()) + 12.
  const paddingTop = (insets.top || 12) + 12;

  const metrics = React.useMemo<ShellMetrics>(
    () => ({ insets, wide, paddingLeft, paddingRight, paddingTop }),
    [insets.top, insets.left, wide, paddingLeft, paddingRight, paddingTop],
  );

  return (
    <ShellMetricsContext.Provider value={metrics}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.background,
            paddingTop,
            paddingLeft,
            paddingRight,
            paddingBottom: 0,
          },
        ]}
      >
        {children}
        <AppNavbar />
        <SuspendedOverlay />
      </View>
    </ShellMetricsContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
