/**
 * «Назад» с запасным маршрутом: после обновления страницы (web) или открытия по прямой ссылке
 * в истории навигации нет предыдущего экрана, и router.back() молча ничего не делает.
 */
import type { Router } from 'expo-router';

export function safeBack(router: Router, fallback: string = '/chats'): void {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
  } catch {
    /* падаем на запасной маршрут */
  }
  router.replace(fallback as never);
}
