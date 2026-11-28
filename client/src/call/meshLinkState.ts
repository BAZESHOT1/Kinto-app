/**
 * Состояние mesh-канала по данным модуля (служебный JSON info по BLE, обновляется каждые 15 с):
 *  gi — транспорт первого хопа до шлюза (0 ESP-NOW, 1 LoRa, 254 — модуль сам шлюз, 255 — шлюза не видно);
 *  ld — нагрузка эфира за 10 с в процентах: [LoRa, ESP-NOW]. Считается прошивкой пассивно (время в эфире
 *       переданных и услышанных кадров), в эфир ничего не добавляет.
 * Приоритет канала звонка: Интернет → E-kMesh (есть путь до Hub по ESP-NOW) → L-kMesh (есть путь до Hub
 * и нагрузка LoRa-канала кластера ниже 60 %).
 */
export type MeshLinkState = {
  at: number;
  gateway: boolean;
  gwIface: number;
  loraLoad: number;
  espnowLoad: number;
};

export type CallChannel = 'internet' | 'e-kmesh' | 'l-kmesh';
export type ChannelChoice = { channel: CallChannel | null; reason: string };

export const LORA_LOAD_LIMIT = 60;
const FRESH_MS = 60_000;

let state: MeshLinkState | null = null;
const listeners = new Set<() => void>();

export function setMeshLinkState(next: Omit<MeshLinkState, 'at'>): void {
  state = { ...next, at: Date.now() };
  listeners.forEach((l) => l());
}

export function getMeshLinkState(): MeshLinkState | null {
  return state && Date.now() - state.at <= FRESH_MS ? state : null;
}

export function onMeshLinkState(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function chooseCallChannel(internetOnline: boolean, forceMesh = false): ChannelChoice {
  if (internetOnline && !forceMesh) return { channel: 'internet', reason: 'Интернет' };
  const s = getMeshLinkState();
  if (!s) return { channel: null, reason: 'Нет связи с модулем: подключите носимый модуль' };
  const viaEspNow = s.gwIface === 0 || s.gwIface === 254;
  if (viaEspNow) return { channel: 'e-kmesh', reason: 'E-kMesh (ESP-NOW)' };
  if (s.gwIface === 1) {
    if (s.loraLoad < LORA_LOAD_LIMIT) return { channel: 'l-kmesh', reason: `L-kMesh (LoRa, нагрузка ${s.loraLoad}%)` };
    return { channel: null, reason: `LoRa-канал перегружен (${s.loraLoad}%), звонок невозможен` };
  }
  return { channel: null, reason: 'До Hub не достучаться через шлюз' };
}
