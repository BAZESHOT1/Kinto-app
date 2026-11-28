// iOS / Android: WebRTC-глобали LiveKit регистрируются лениво — при первом звонке, а не при запуске приложения.
// Сбой в нативном модуле не должен ронять старт: ошибка пробрасывается только в сам звонок.
let done = false;
export function ensureCallGlobals(): void {
  if (done) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerGlobals } = require('@livekit/react-native');
  registerGlobals();
  done = true;
}
