/**
 * Звонок в фоне — web / PWA / Windows (Electron).
 *  - Wake Lock: экран не гаснет во время звонка (и не усыпляет вкладку).
 *  - MediaSession: звонок виден в шторке/на экране блокировки с кнопками «Сбросить» и «Микрофон»; система считает вкладку
 *    медиа-сессией и реже усыпляет её.
 *  - Тихий аудиопоток: браузеры не замораживают вкладку, пока в ней играет звук.
 *  - Electron: блокировка энергосбережения (powerSaveBlocker) через preload.
 * Если вкладку всё же заморозили (iOS Safari/PWA), CallHost переподключает звонок при возврате.
 */
export type CallKeepAliveOpts = { title: string; onHangup: () => void; onMute: () => void };

type WakeLockSentinelLike = { release: () => Promise<void> };

export function startCallKeepAlive(opts: CallKeepAliveOpts): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  let lock: WakeLockSentinelLike | null = null;
  let stopped = false;
  let ctx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;

  const acquire = async () => {
    try {
      const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };
      if (nav.wakeLock && !stopped) lock = await nav.wakeLock.request('screen');
    } catch {
      /* не поддерживается или запрещено */
    }
  };
  void acquire();
  // Wake Lock снимается при сворачивании — берём заново при возвращении.
  const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };
  document.addEventListener('visibilitychange', onVisible);

  // Тихий генератор: «живой» звук не даёт браузеру заморозить вкладку.
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) {
      ctx = new AC();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001;
      osc = ctx.createOscillator();
      osc.frequency.value = 40;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      void ctx.resume().catch(() => undefined);
    }
  } catch {
    /* не критично */
  }

  try {
    const ms = (navigator as unknown as { mediaSession?: MediaSession }).mediaSession;
    if (ms) {
      ms.metadata = new MediaMetadata({ title: 'Идёт звонок', artist: opts.title || 'Kinto', album: 'Kinto' });
      ms.playbackState = 'playing';
      const set = (action: string, handler: (() => void) | null) => {
        try { ms.setActionHandler(action as MediaSessionAction, handler); } catch { /* действие не поддерживается */ }
      };
      set('hangup', opts.onHangup);
      set('stop', opts.onHangup);
      set('togglemicrophone', opts.onMute);
    }
  } catch {
    /* MediaSession недоступен */
  }

  // Windows (Electron): не засыпать, пока идёт звонок.
  try {
    (globalThis as { kintoDesktop?: { callActive?: (on: boolean) => void } }).kintoDesktop?.callActive?.(true);
  } catch {
    /* вне оболочки */
  }

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => undefined);
    try { osc?.stop(); void ctx?.close(); } catch { /* уже закрыт */ }
    try {
      const ms = (navigator as unknown as { mediaSession?: MediaSession }).mediaSession;
      if (ms) {
        ms.metadata = null;
        ms.playbackState = 'none';
        for (const a of ['hangup', 'stop', 'togglemicrophone']) {
          try { ms.setActionHandler(a as MediaSessionAction, null); } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    try {
      (globalThis as { kintoDesktop?: { callActive?: (on: boolean) => void } }).kintoDesktop?.callActive?.(false);
    } catch { /* ignore */ }
  };
}
