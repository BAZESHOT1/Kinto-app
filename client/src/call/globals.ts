// Web / Windows (браузерная оболочка): WebRTC уже есть в окружении, глобали регистрировать не нужно.
export function ensureCallGlobals(): void {}

/** Web: модули грузятся без защиты (на iOS/Android — см. globals.native.ts). */
export function guarded<T>(fn: () => T): T {
  return fn();
}
