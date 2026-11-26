import React from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { useBodyBackground } from '../theme/useBodyBackground';
import { useIsWide } from '../theme/useIsWide';
import { AppNavbar, SIDEBAR_WIDTH } from './AppNavbar';
import { SuspendedOverlay } from './SuspendedOverlay';

/**
 * Каркас страницы: сайдбар/док и контент с отступами + safe-area.
 * На web фон дублируется в <body>; на native задаём theme.background,
 * иначе прозрачный Stack показывал чёрный экран.
 *
 * Под навбаром (док на смартфоне / сайдбар на ПК) НЕ резервируем полосу:
 * контент при скролле уходит под плавающий док. Безопасный нижний отступ
 * задаётся на самих страницах через contentContainerStyle (chats — 130,
 * settings — 120/140), чтобы последние элементы не прятались под кнопками.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const inset = useSafeAreaInsets();
  const wide = useIsWide();
  const theme = useTheme();
  // ВАЖНО: отступы НЕ зависят от pathname. Раньше usePathname() переключал
  // padding в момент начала 240-мс анимации стека, из-за чего оба экрана
  // (уходящий и приходящий) меняли размер посреди перехода — это и было
  // видимое «дёрганье» при чаты↔чат и настройки↔профиль.
  useBodyBackground();
  const shellBackground = theme.background;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View
      style={[
        styles.root,
        {
          backgroundColor: shellBackground,
          paddingTop: (inset.top || 12) + 12,
          // Док/сайдбар плавающие: фоновая полоса под ними не нужна.
          paddingBottom: wide ? 32 : 0,
          // Отступы постоянны для всех экранов: это критично для плавности
          // переходов. Фон оболочки совпадает с темой, поэтому чат/профиль
          // выглядят full-bleed без изменения геометрии родителя.
          paddingLeft: wide ? (inset.left || 0) + SIDEBAR_WIDTH + 24 : 16,
          paddingRight: wide ? 28 : 16,
        },
      ]}
    >
      {children}
      <AppNavbar />
      <SuspendedOverlay />
    </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
