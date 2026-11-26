export interface PickedFile {
  name: string;
  mime: string;
  bytes: Uint8Array;
  /** Длительность голосового сообщения в секундах. */
  duration?: number;
  /** Поддержка нескольких вложений в одном сообщении (до 10). */
  id?: string;
}
