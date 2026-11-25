import { CALL_BITRATE, type CallChannel, type CallJoiner, type CallOfferResult, type CallSession } from './transport';

/** Минимальный WebRTC-фасад, одинаковый для браузера и react-native-webrtc. */
export interface RtcFacade {
  peer: () => any;
  getUserMedia: (constraints: Record<string, unknown>) => Promise<any>;
}

export async function createCallOffer(
  rtc: RtcFacade,
  channel: CallChannel,
  join: CallJoiner,
): Promise<CallOfferResult> {
  const pc = rtc.peer();
  const stream = await rtc.getUserMedia({ audio: true, video: false });
  const track = stream.getAudioTracks()[0];
  if (!track) throw new Error('microphone_unavailable');
  // Ограничиваем битрейт sending-тренсceiver под выбранный канал.
  const [sender] = stream.getAudioTracks().length ? pc.addTrack(track, stream) : [];
  if (sender && typeof sender.setParameters === 'function') {
    const params = sender.getParameters();
    const { min, max } = CALL_BITRATE[channel];
    params.encodings = params.encodings?.length ? params.encodings : [{}];
    params.encodings[0].maxBitrate = max;
    params.encodings[0].minBitrate = min;
    await sender.setParameters(params).catch(() => undefined);
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce(pc);
  const answer = await join(pc.localDescription.sdp);
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });
  let muted = false;
  const session: CallSession = {
    setMuted: (value) => {
      muted = value;
      track.enabled = !muted;
    },
    stats: async () => {
      const bitrateKbps = Math.round((CALL_BITRATE[channel].max / 1000) * (muted ? 0 : 1));
      return { bitrateKbps, quality: bitrateKbps >= CALL_BITRATE[channel].min / 1000 ? 'good' : 'poor' };
    },
    stop: () => {
      try { track.stop(); } catch { /* noop */ }
      pc.close();
    },
  };
  return { sdp: pc.localDescription.sdp, session };
}

async function waitForIce(pc: any): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 2500);
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    };
    pc.addEventListener?.('icegatheringstatechange', check);
    if (pc.onicegatheringstatechange !== undefined) pc.onicegatheringstatechange = check;
    setTimeout(check, 200);
  });
}
