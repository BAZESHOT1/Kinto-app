// iOS / Android: WebRTC-глобали LiveKit регистрируются лениво — при первом звонке, а не при запуске приложения.
// Сбой в нативном модуле не должен ронять старт: ошибка пробрасывается только в сам звонок.
let done = false;

/** В Hermes нет DOMException, а WebRTC/LiveKit обращаются к нему при загрузке и в ошибках — без него звонок ронял приложение. */
function ensureDomException(): void {
  const g = globalThis as unknown as { DOMException?: unknown };
  if (typeof g.DOMException !== 'undefined') return;
  class DOMExceptionPolyfill extends Error {
    code = 0;
    constructor(message = '', name = 'Error') {
      super(message);
      this.name = name;
    }
  }
  g.DOMException = DOMExceptionPolyfill;
}

type Handler = (error: unknown, isFatal?: boolean) => void;

/**
 * Metro считает любое исключение при первой загрузке модуля фатальным и роняет приложение, даже если вызов
 * обёрнут в try/catch. Пока грузятся нативные модули звонка, фатальные ошибки только пишем в журнал:
 * саму ошибку получит экран звонка через обычный reject.
 */
export function guarded<T>(fn: () => T): T {
  const eu = (globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): Handler; setGlobalHandler(h: Handler): void } }).ErrorUtils;
  if (!eu) return fn();
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((error) => {
    console.warn('[call] module load error', error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  });
  try {
    return fn();
  } finally {
    // Асинхронные отчёты об ошибке приходят следом — возвращаем штатный обработчик чуть позже.
    setTimeout(() => eu.setGlobalHandler(prev), 1500);
  }
}

export function ensureCallGlobals(): void {
  if (done) return;
  ensureDomException();
  guarded(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { registerGlobals } = require('@livekit/react-native');
    registerGlobals();
  });
  done = true;
}
