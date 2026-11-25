import { createCallOffer, type RtcFacade } from './shared';
import type { CallChannel, CallJoiner, CallOfferResult } from './transport';

const rtc: RtcFacade = {
  peer: () => new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }),
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints as MediaStreamConstraints),
};

export async function createOffer(channel: CallChannel, join: CallJoiner): Promise<CallOfferResult> {
  return createCallOffer(rtc, channel, join);
}
