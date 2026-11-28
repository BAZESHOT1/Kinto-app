import React, { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { Platform, View, StyleSheet } from 'react-native';
import { AppShell, useShellMetrics } from '../../src/components/AppShell';
import { IncomingCallOverlay } from '../../src/components/IncomingCallOverlay';
import { useStore } from '../../src/state/useStore';
import { useTheme } from '../../src/theme/useTheme';

/** Нативный жест назад доступен всем экранам, кроме корневых вкладок. */
const backGesture = {
  gestureEnabled: true,
  fullScreenGestureEnabled: false,
} as const;

/** Каркас приложения: маршрут без сессии всегда уводит на /login. */
export default function AppLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const session = useStore((s) => s.session);
  const ready = useStore((s) => s.ready);

  useEffect(() => {
    if (!ready || !pathname) return;
    if (session) return undefined;
    // Прямая ссылка без входа: корневой layout ещё не смонтирован — откладываем переход,
    // иначе expo-router бросает «Attempted to navigate before mounting the Root Layout».
    const timer = setTimeout(() => {
      try {
        router.replace('/login' as never);
      } catch {
        /* повторим при следующем изменении pathname/session */
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [pathname, ready, session, router]);

  if (!ready || !session) {
    // корневой layout восстанавливает сессию и выставляет ready
    return <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: theme.background }} />;
  }

  return (
    <AppShell>
      <AppStack />
      <IncomingCallOverlay />
    </AppShell>
  );
}

/**
 * Стек экранов. На iOS/Android native-экраны (react-native-screens) обрезают содержимое по своим границам, поэтому
 * full-bleed фон (отрицательные margin на экранах чата и профиля) упирался в отступы оболочки и давал рамки.
 * Здесь сам стек растягивается на весь экран (отрицательные margin = отступы оболочки), а те же отступы
 * возвращаются экранам через contentStyle: раскладка содержимого не меняется, зато фон может доходить до краёв.
 */
function AppStack() {
  const theme = useTheme();
  const shell = useShellMetrics();
  const native = Platform.OS !== 'web';
  const pad = native ? { paddingTop: shell.paddingTop, paddingLeft: shell.paddingLeft, paddingRight: shell.paddingRight } : null;
  const content = { backgroundColor: theme.background, ...pad };
  // Модальные экраны показываются поверх всего окна и своих отступов оболочки не имели.
  const modalContent = { backgroundColor: theme.background };
  const stack = (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: content,
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
        {/* Все экраны, кроме корневых «Чаты»/«Настройки», поддерживают
            нативный жест назад от левого края (iOS edge swipe). */}
        <Stack.Screen name="settings/params" options={backGesture} />
        <Stack.Screen name="settings/notifications" options={backGesture} />
        <Stack.Screen name="settings/appearance" options={backGesture} />
        <Stack.Screen name="settings/network" options={backGesture} />
        <Stack.Screen name="settings/security" options={backGesture} />
        <Stack.Screen name="settings/privacy" options={backGesture} />
        <Stack.Screen name="settings/about" options={backGesture} />
        <Stack.Screen name="settings/logs" options={backGesture} />
        <Stack.Screen name="modules" options={backGesture} />
        <Stack.Screen name="modules-add" options={backGesture} />
        <Stack.Screen name="firmware" options={backGesture} />
        <Stack.Screen name="nodes" options={backGesture} />
        <Stack.Screen name="language" options={backGesture} />
        <Stack.Screen name="admin" options={backGesture} />
        <Stack.Screen name="chat/[id]" options={backGesture} />
        <Stack.Screen name="chat/[id]/call" options={{ ...backGesture, presentation: 'modal', animation: 'slide_from_bottom', contentStyle: modalContent }} />
        <Stack.Screen name="chat/[id]/info" options={backGesture} />
        <Stack.Screen name="user/[username]" options={backGesture} />
        <Stack.Screen name="user/[username]/edit" options={backGesture} />
        <Stack.Screen name="compose" options={{ ...backGesture, presentation: 'modal', animation: 'slide_from_bottom', contentStyle: modalContent }} />
      </Stack>
  );
  if (!native) return stack;
  return (
    <View style={{ flex: 1, marginTop: -shell.paddingTop, marginLeft: -shell.paddingLeft, marginRight: -shell.paddingRight }}>
      {stack}
    </View>
  );
}
