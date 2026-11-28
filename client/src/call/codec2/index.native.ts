import { createCodec2With, type Codec2Bitrate, type Codec2Instance } from './core';
export type { Codec2Bitrate, Codec2Instance } from './core';

// iOS / Android (Hermes без WebAssembly): тот же Codec2, собранный в чистый JS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const factory = () => require('./codec2.native.js')();

export const createCodec2 = (bitrate: Codec2Bitrate = 3200): Promise<Codec2Instance> => createCodec2With(factory, bitrate);
