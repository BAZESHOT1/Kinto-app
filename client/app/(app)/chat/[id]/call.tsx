/**
 * Маршрут /chat/[id]/call — только запуск: звонком владеет глобальный CallHost (src/call/CallHost.tsx),
 * чтобы его можно было свернуть и пользоваться клиентом. Здесь параметры передаются в хост и экран закрывается.
 */
import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallStore } from '../../../../src/call/callStore';

export default function CallLauncher() {
  const params = useLocalSearchParams<{ id?: string; type?: string; callId?: string; title?: string; mesh?: string }>();
  const router = useRouter();
  React.useEffect(() => {
    useCallStore.getState().openCall({
      chatId: params.id && params.id !== 'x' ? String(params.id) : '',
      chatType: String(params.type ?? ''),
      joinId: typeof params.callId === 'string' ? params.callId : '',
      title: typeof params.title === 'string' ? params.title : '',
      mesh: params.mesh === '1',
    });
    if (router.canGoBack()) router.back();
    else router.replace('/chats' as never);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <View style={{ flex: 1 }} />;
}
