/**
 * Платформенный ввод-вывод PCM 8 кГц для голоса через E-kMesh.
 * Web и Windows (браузерная оболочка): Web Audio. iOS/Android: см. meshAudioIO.native.ts.
 */
export interface MeshAudioIO {
  /** Начать захват микрофона: onPcm получает куски по 160 отсчётов (20 мс, 8 кГц, Int16). */
  start(onPcm: (pcm: Int16Array) => void): Promise<void>;
  /** Поставить кусок PCM в очередь воспроизведения; gapMs — пауза перед ним (тишина говорящего). */
  play(pcm: Int16Array, gapMs?: number): void;
  setMuted(muted: boolean): void;
  stop(): void;
}

const CHUNK = 160;

export function createMeshAudioIO(): MeshAudioIO {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let processor: ScriptProcessorNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let muted = false;
  let nextTime = 0;
  let acc = new Int16Array(0);

  return {
    async start(onPcm) {
      const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('mesh_audio_unsupported');
      // Контекст на 8 кГц: браузер сам ресемплирует микрофон и вывод.
      ctx = new AC({ sampleRate: 8000 });
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      source = ctx.createMediaStreamSource(stream);
      processor = ctx.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i += 1) {
          const s = muted ? 0 : Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const merged = new Int16Array(acc.length + pcm.length);
        merged.set(acc, 0);
        merged.set(pcm, acc.length);
        let off = 0;
        while (merged.length - off >= CHUNK) {
          onPcm(merged.slice(off, off + CHUNK));
          off += CHUNK;
        }
        acc = merged.slice(off);
      };
      source.connect(processor);
      processor.connect(ctx.destination); // без подключения к destination ScriptProcessor не работает; вход в выход не пишем
      nextTime = 0;
    },
    play(pcm, gapMs = 0) {
      if (!ctx) return;
      const buf = ctx.createBuffer(1, pcm.length, 8000);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i += 1) ch[i] = pcm[i] / 32768;
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(ctx.destination);
      const now = ctx.currentTime;
      // Джиттер-буфер 150 мс: кадры по mesh приходят пачками; после паузы начинаем с запасом.
      if (nextTime < now + 0.05) nextTime = now + 0.15;
      else if (gapMs > 0) nextTime += Math.min(gapMs, 400) / 1000;
      node.start(nextTime);
      nextTime += pcm.length / 8000;
    },
    setMuted(m) {
      muted = m;
    },
    stop() {
      try { processor?.disconnect(); source?.disconnect(); } catch { /* уже отключено */ }
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => undefined);
      ctx = null; stream = null; processor = null; source = null;
    },
  };
}
