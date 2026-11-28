/**
 * Звонок в фоне — iOS / Android.
 *  - Android: foreground service (тип microphone) через notifee: пока идёт звонок, система не усыпляет приложение и не
 *    отбирает микрофон в фоне. Постоянное уведомление «Идёт звонок» открывает приложение.
 *  - iOS: звонок держит активная AVAudioSession (UIBackgroundModes: audio, voip в app.json) — приложение остаётся
 *    живым при сворачивании; в строке состояния показывается индикатор микрофона.
 * После звонка служебное уведомление mesh-модуля (если оно было) возвращается.
 */
import { Platform } from 'react-native';
import notifee, { AndroidForegroundServiceType, AndroidImportance } from '@notifee/react-native';
import { ensureForegroundHandler, isMeshForegroundServiceRunning, markMeshServiceStopped, startMeshForegroundService } from '../modules/background';

export type CallKeepAliveOpts = { title: string; onHangup: () => void; onMute: () => void };

const CALL_CHANNEL = 'klinto-call';
const CALL_NOTIFICATION = 'klinto-call-service';

export function startCallKeepAlive(opts: CallKeepAliveOpts): () => void {
  if (Platform.OS !== 'android') return () => undefined;
  let stopped = false;
  let meshWasRunning = false;
  void (async () => {
    try {
      meshWasRunning = await isMeshForegroundServiceRunning();
      await notifee.createChannel({ id: CALL_CHANNEL, name: 'Звонок', importance: AndroidImportance.LOW, vibration: false });
      ensureForegroundHandler();
      if (stopped) return;
      await notifee.displayNotification({
        id: CALL_NOTIFICATION,
        title: 'Идёт звонок',
        body: opts.title || 'Kinto',
        android: {
          channelId: CALL_CHANNEL,
          asForegroundService: true,
          foregroundServiceTypes: [
            AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_MICROPHONE,
            AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
          ],
          ongoing: true,
          onlyAlertOnce: true,
          importance: AndroidImportance.LOW,
          smallIcon: 'ic_launcher',
          pressAction: { id: 'default', launchActivity: 'default' },
        },
      });
    } catch (e) {
      console.warn('[call] foreground service failed', String(e));
    }
  })();
  return () => {
    stopped = true;
    void (async () => {
      try {
        await notifee.stopForegroundService();
        await notifee.cancelNotification(CALL_NOTIFICATION);
      } catch {
        /* уведомления могло уже не быть */
      }
      // Сервис mesh-модуля был остановлен вместе со звонком — возвращаем его.
      if (meshWasRunning) {
        markMeshServiceStopped();
        void startMeshForegroundService().catch(() => undefined);
      }
    })();
  };
}
