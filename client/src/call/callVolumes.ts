/**
 * Громкость собеседников (0…2) запоминается на устройстве по идентификатору пользователя и действует
 * в следующих звонках. Хранится в локальном кэше (kv), в эфир и на сервер не уходит.
 */
import { kv } from '../crypto/storage';

const KEY = 'sg:call-volumes';
const volumes = new Map<string, number>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function loadCallVolumes(): Promise<void> {
  if (loaded) return Promise.resolve();
  loaded = true;
  return Promise.resolve(kv.get(KEY))
    .then((raw) => {
      if (!raw) return;
      try {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        for (const [id, v] of Object.entries(obj)) {
          if (typeof v === 'number' && v >= 0 && v <= 2) volumes.set(id, v);
        }
      } catch {
        /* повреждённое значение игнорируем */
      }
    })
    .catch(() => undefined);
}

export function getSavedVolume(userId: string): number | undefined {
  return volumes.get(userId);
}

export function saveVolume(userId: string, v: number): void {
  if (Math.abs(v - 1) < 0.005) volumes.delete(userId);
  else volumes.set(userId, v);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    // Не раздуваем кэш: храним не больше 200 собеседников (самые недавние).
    const entries = [...volumes.entries()].slice(-200);
    void Promise.resolve(kv.set(KEY, JSON.stringify(Object.fromEntries(entries)))).catch(() => undefined);
  }, 400);
}

void loadCallVolumes();
