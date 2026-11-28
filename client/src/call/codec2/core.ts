/**
 * Codec2 (drowe67/codec2 1.2.0, LGPL-2.1) в JS: WebAssembly в браузере/Windows-оболочке, чистый JS на Hermes.
 * 8 кГц, моно, 16 бит. 3200 бит/с — E-kMesh (ESP-NOW), 1200 бит/с — L-kMesh (LoRa).
 */
export type Codec2Bitrate = 3200 | 1200 | 700;

/** 700 — режим 700C: максимальное сжатие для звонков через kMesh (ESP-NOW и LoRa). */
const MODES: Record<Codec2Bitrate, number> = { 3200: 0, 1200: 5, 700: 8 };

export interface Codec2Instance {
  readonly bitrate: Codec2Bitrate;
  readonly samplesPerFrame: number;
  readonly bytesPerFrame: number;
  encode(pcm: Int16Array): Uint8Array;
  decode(bits: Uint8Array): Int16Array;
  destroy(): void;
}

let modulePromise: Promise<any> | null = null;

export async function createCodec2With(factory: () => Promise<any>, bitrate: Codec2Bitrate): Promise<Codec2Instance> {
  modulePromise ??= factory();
  const M = await modulePromise;
  const h = M._codec2_create(MODES[bitrate]);
  const samplesPerFrame: number = M._codec2_samples_per_frame(h);
  const bytesPerFrame: number = M._codec2_bytes_per_frame(h);
  const pcmPtr: number = M._malloc(samplesPerFrame * 2);
  const bitsPtr: number = M._malloc(bytesPerFrame);
  return {
    bitrate,
    samplesPerFrame,
    bytesPerFrame,
    encode(pcm) {
      M.HEAP16.set(pcm.subarray(0, samplesPerFrame), pcmPtr >> 1);
      M._codec2_encode(h, bitsPtr, pcmPtr);
      return M.HEAPU8.slice(bitsPtr, bitsPtr + bytesPerFrame);
    },
    decode(bits) {
      M.HEAPU8.set(bits.subarray(0, bytesPerFrame), bitsPtr);
      M._codec2_decode(h, pcmPtr, bitsPtr);
      return M.HEAP16.slice(pcmPtr >> 1, (pcmPtr >> 1) + samplesPerFrame);
    },
    destroy() {
      M._free(pcmPtr);
      M._free(bitsPtr);
      M._codec2_destroy(h);
    },
  };
}
