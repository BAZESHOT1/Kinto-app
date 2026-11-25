/** Общий интерфейс аудиотранспорта звонков (web/native реализованы отдельно). */
export type CallChannel = 'internet' | 'e-kmesh' | 'l-kmesh';

export interface CallSession {
  /** Мягко выключаем микрофон (RTP continues, но аудио неCaptured). */
  setMuted(muted: boolean): void;
  /** Текущий битрейт и качество канала (для уведомления пользователя). */
  stats(): Promise<{ bitrateKbps: number; quality: 'good' | 'poor' }>;
  stop(): void;
}

export interface CallOfferResult {
  sdp: string;
  session: CallSession;
}

/** Битрейты по каналу (коде Opus). L-kMesh — адаптивный 3–12 kbps. */
export const CALL_BITRATE: Record<CallChannel, { min: number; max: number }> = {
  internet: { min: 24_000, max: 32_000 },
  'e-kmesh': { min: 16_000, max: 24_000 },
  'l-kmesh': { min: 3_000, max: 12_000 },
};

/** channel — выбранный пользователем канал, offer — SDP из createOffer(). */
export type CallJoiner = (sdp: string) => Promise<string>;

export interface CallTransport {
  createOffer(channel: CallChannel): Promise<CallOfferResult>;
}
