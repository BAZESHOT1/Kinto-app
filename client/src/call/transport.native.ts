import { createCallOffer, type RtcFacade } from './shared';
import type { CallChannel, CallJoiner, CallOfferResult } from './constants';

// Expo/RN: импорт resolve-ится через autolinking react-native-webrtc.
// Динамический импорт защищает веб-бандл от нативной библиотеки.
async function loadRtc(): Promise<RtcFacade> {
  const mod = await import('react-native-webrtc');
  const { RTCPeerConnection, mediaDevices } = mod as any;
  return {
    peer: () => new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }),
    getUserMedia: (constraints) => mediaDevices.getUserMedia(constraints),
  };
}

export async function createOffer(channel: CallChannel, join: CallJoiner): Promise<CallOfferResult> {
  return createCallOffer(await loadRtc(), channel, join);
}
