import React, { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { AppShell } from '../../src/components/AppShell';
import { useStore } from '../../src/state/useStore';
import { useTheme } from '../../src/theme/useTheme';

/** Каркас приложения: маршрут без сессии всегда уводит на /login. */
export default function AppLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const session = useStore((s) => s.session);
  const ready = useStore((s) => s.ready);

  useEffect(() => {
    if (!ready || !pathname) return;
    if (!session) router.replace('/login' as never);
  }, [pathname, ready, session, router]);

  if (!ready || !session) {
    // корневой layout восстанавливает сессию и выставляет ready
    return <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: theme.background }} />;
  }

  return (
    <AppShell>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          animation: 'slide_from_right',
          animationDuration: 240,
          // Обычный свайп от левого края. Полноэкранный жест и кастомная
          // анимация жеста отключены: в react-native-screens они вызывают
          // snap в 1-2 кадра при отпускании — экран «дёргается» при возврате.
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
          customAnimationOnGesture: false,
          gestureDirection: 'horizontal',
        }}
      >
        <Stack.Screen
          name="chats"
          // Корневая вкладка: свайп назад не должен уводить на другой экран.
          // Анимация фиксированная — смена опций по route.params во время
          // перехода тоже давала рывок.
          options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
        />
        <Stack.Screen name="settings" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
        <Stack.Screen name="settings/params" />
        <Stack.Screen name="settings/notifications" />
        <Stack.Screen name="settings/appearance" />
        <Stack.Screen name="settings/network" />
        <Stack.Screen name="settings/security" />
        <Stack.Screen name="settings/privacy" />
        <Stack.Screen name="settings/about" />
        <Stack.Screen name="settings/logs" />
        <Stack.Screen name="modules" />
        <Stack.Screen name="modules-add" />
        <Stack.Screen name="firmware" />
        <Stack.Screen name="nodes" />
        <Stack.Screen name="language" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="chat/[id]/call" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }} />
        <Stack.Screen name="chat/[id]/info" />
        <Stack.Screen name="user/[username]" />
        <Stack.Screen name="user/[username]/edit" />
        <Stack.Screen name="compose" options={{ presentation: 'modal', animation: 'slide_from_bottom', gestureEnabled: true }} />
      </Stack>
    </AppShell>
  );
}
