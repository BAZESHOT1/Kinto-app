/**
 * Платформо-независимые типы и константы звонков.
 *
 * Важно: импортировать их надо ТОЛЬКО отсюда. Импорт из './transport'
 * на web/native резолвится в transport.web.ts / transport.native.ts,
 * которые НЕ экспортируют CALL_BITRATE — отсюда была ошибка
 * "Cannot read properties of undefined (reading 'internet')".
 */

export type CallChannel = 'internet' | 'e-kmesh' | 'l-kmesh';

export interface CallSession {
  /** Мягко выключаем микрофон (RTP продолжается, аудио неCaptured). */
  setMuted(muted: boolean): void;
  stats(): Promise<{ bitrateKbps: number; quality: 'good' | 'poor' }>;
  stop(): void;
}

export interface CallOfferResult {
  sdp: string;
  session: CallSession;
}

/** channel — выбранный канал, offer — SDP из createOffer(). */
export type CallJoiner = (sdp: string) => Promise<string>;

/** Битрейты по каналу (кодек Opus). */
export const CALL_BITRATE: Record<CallChannel, { min: number; max: number }> = {
  internet: { min: 24_000, max: 32_000 },
  'e-kmesh': { min: 16_000, max: 24_000 },
  'l-kmesh': { min: 3_000, max: 12_000 },
};
