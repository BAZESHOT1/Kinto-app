/**
 * Web push через Firebase Cloud Messaging.
 *
 * Файл платформенный (`*.web.ts`): на нативе используется отдельная
 * реализация, поэтому здесь нет ни одного импорта нативных модулей.
 *
 * SSR-safe: никакой работы на этапе импорта модуля нет, всё выполняется
 * только внутри registerWebPush и только при наличии `window`.
 */
import * as api from '../data/api';
import { useStore } from '../state/useStore';

/** Конфиг web-приложения Firebase (проект vdoh-crm). */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBW8RI2Hp2jezNlprSm-IeawWBRphEFjJY',
  authDomain: 'vdoh-crm.firebaseapp.com',
  projectId: 'vdoh-crm',
  storageBucket: 'vdoh-crm.firebasestorage.app',
  messagingSenderId: '1014607310889',
  appId: '1:1014607310889:web:c184cfeb2c861d0d5d6c38',
  measurementId: 'G-CDLNJE1B6Z',
} as const;

/** Service worker лежит в public/ и попадает в dist как /firebase-messaging-sw.js. */
const KL_PATH = '/firebase-messaging-sw.js';

const ICON = '/icon-192.png';

export type WebPushCleanup = () => void;

/** Минимальная часть сессии, нужная для привязки токена к устройству. */
export interface WebPushSession {
  deviceId?: string;
}

import { isPushContentHidden } from './pushPrefs';

const noop: WebPushCleanup = () => undefined;

let vapidWarned = false;
const recentNotifications = new Map<string, number>();

function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (!('Notification' in window)) return false;
  return true;
}

function openChatFromData(data: Record<string, string> | undefined): void {
  const chatId = data?.chatId ?? data?.chat_id;
  const url = chatId ? `/chat/${encodeURIComponent(chatId)}` : '/chats';
  try {
    window.location.assign(url);
  } catch {
    /* навигация может быть запрещена — не ломаем вкладку */
  }
}

/**
 * Запрос разрешения ДОЛЖЕН быть первым async-вызовом в обработчике жеста,
 * иначе Safari/Chrome теряют user activation и диалог не появляется.
 */
export async function requestWebPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isWebPushSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  // Вызов должен произойти синхронно в жесте пользователя (б await до него).
  return Notification.requestPermission();
}

/**
 * Просит разрешение на уведомления при первом посещении (если ещё не решено)
 * и заранее регистрирует service worker. Безопасно вызывать без сессии.
 */
export async function ensureWebPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isWebPushSupported()) return 'unsupported';
  // Сначала синхронный запрос (сохраняем жест пользователя), потом SW.
  const permission = await requestWebPushPermission();
  if (permission === 'unsupported' || permission === 'denied') return permission;
  try {
    await navigator.serviceWorker.register(KL_PATH).catch(() => undefined);
    await navigator.serviceWorker.ready.catch(() => undefined);
  } catch {
    /* service worker может быть недоступен — разрешение уже получено */
  }
  return permission;
}

/**
 * Регистрирует web push для текущей сессии.
 *
 * Возвращает cleanup; при отсутствии поддержки, разрешения или VAPID-ключа
 * возвращает безвредный no-op и никогда не бросает исключение.
 */
async function doRegisterWebPush(
  session: WebPushSession | null | undefined,
): Promise<WebPushCleanup> {
  if (!isWebPushSupported()) return noop;

  const vapidKey =
    process.env.EXPO_PUBLIC_FCM_VAPID_KEY ||
    'BDESQnjb2N39oeIlvFrpDPrcYDH4oOKF8xonjc6TevIiz6d5uoYHSws9EcUWDpzfrjYpcaHsdcAVOw4Fv-LgZig';
  if (!vapidKey) {
    if (!vapidWarned) {
      vapidWarned = true;
      console.warn(
        '[push] Web push отключён: не задан EXPO_PUBLIC_FCM_VAPID_KEY. ' +
          'Добавьте VAPID-ключ Firebase (Project settings → Cloud Messaging → Web Push certificates) в .env.',
      );
    }
    return noop;
  }

  try {
    const [appMod, messagingMod] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);

    const { getApp, getApps, initializeApp } = appMod;
    const { getMessaging, getToken, isSupported, onMessage } = messagingMod;

    // Браузеры без поддержки FCM (например, старый Safari) — тихо выходим.
    if (typeof isSupported === 'function' && !(await isSupported())) return noop;

    const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
    const messaging = getMessaging(app);

    const permission =
      Notification.permission === 'default'
        ? await requestWebPushPermission()
        : Notification.permission;
    if (permission !== 'granted') return noop;

    const registration = await navigator.serviceWorker.register(KL_PATH);
    await navigator.serviceWorker.ready.catch(() => undefined);

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    if (!token) return noop;

    // Ошибку отправки на сервер не считаем фатальной: push уже работает локально.
    await api.api
      .registerPushToken({ token, platform: 'web', deviceId: session?.deviceId })
      .catch((e) => console.warn('[push] Не удалось отправить токен на сервер:', e));

    // Foreground-сообщения (вкладка в фокусе) FCM не показывает сам.
    // Одно сообщение может прийти дважды (FCM-токен ротируется, старый токен
    // остаётся активным, поэтому multicast доставляет дубль ~через секунду).
    // Общий дедупликатор на вкладку (живёт между перерегистрациями).
    const recent = recentNotifications;
    const dedupeKey = (data: Record<string, unknown> | undefined, title: string, body: string) =>
      String(data?.messageId ?? data?.message_id ?? `${data?.chatId ?? ''}|${title}|${body}`);

    const unsubscribe = onMessage(messaging, (payload) => {
      void (async () => {
      const hidden = await isPushContentHidden();
      const title = hidden ? 'Kinto' : (payload.notification?.title ?? payload.data?.title ?? 'Kinto');
      const body = hidden ? 'Новое сообщение' : (payload.notification?.body ?? payload.data?.body ?? '');
      const data = payload.data;

      const key = dedupeKey(data, title, body);
      const now = Date.now();
      for (const [k, at] of recent) if (now - at > 10_000) recent.delete(k);
      if (recent.has(key)) return;
      recent.set(key, now);

      try {
        if (Notification.permission === 'granted') {
          const notification = new Notification(title, {
            body,
            icon: ICON,
            data,
          });
          notification.onclick = () => {
            try {
              window.focus();
            } catch {
              /* ignore */
            }
            openChatFromData(data);
            notification.close();
          };
        }
      } catch (e) {
        // На некоторых мобильных браузерах конструктор Notification недоступен.
        console.warn('[push] Не удалось показать foreground-уведомление:', e);
      }

      // Дублируем в toast-систему активной вкладки.
      useStore.getState().pushToast({
        kind: 'info',
        message: body ? `${title}: ${body}` : title,
      });
      })();
    });

    return () => {
      try {
        unsubscribe();
      } catch {
        /* ignore */
      }
    };
  } catch (e) {
    console.warn('[push] Не удалось инициализировать web push:', e);
    return noop;
  }
}

/**
 * Гарантия: ровно одна подписка на сообщения на вкладку. Без этого React/StrictMode
 * и смена сессии создавали второй onMessage с собственным dedupe-мапом —
 * пользователь видел два одинаковых уведомления с интервалом ~1 сек.
 */
let registrationPromise: Promise<WebPushCleanup> | null = null;

export function registerWebPush(
  session: WebPushSession | null | undefined,
): Promise<WebPushCleanup> {
  if (registrationPromise) return registrationPromise;
  const current = doRegisterWebPush(session).then((stop) => {
    // Подписка не создана (нет разрешения/токена) — не кэшируем: следующий вызов попробует снова.
    if (stop === noop) {
      if (registrationPromise === current) registrationPromise = null;
      return noop;
    }
    return () => {
      stop();
      if (registrationPromise === current) registrationPromise = null;
    };
  }).catch(() => {
    if (registrationPromise === current) registrationPromise = null;
    return noop;
  });
  registrationPromise = current;
  return current;
}
