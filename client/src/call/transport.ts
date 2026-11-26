/** Общий интерфейс аудиотранспорта звонков (web/native реализованы отдельно). */
import type { CallChannel, CallOfferResult } from './constants';
export * from './constants';

export interface CallTransport {
  createOffer(channel: CallChannel): Promise<CallOfferResult>;
}
