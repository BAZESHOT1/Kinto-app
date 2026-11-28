/**
 * Общий рендер процедурных фонов: один и тот же код работает с WebGL2 в браузере и с expo-gl на iOS/Android.
 * Полноэкранный треугольник без буферов (gl_VertexID), цвета — из настроек фона.
 */
import { AURORA_FRAGMENT, DITHER_FRAGMENT, PIXELBLAST_FRAGMENT, VERTEX } from './shaders';
import { hexToRgb, type ProceduralSettings } from './catalog';

type GL = WebGL2RenderingContext;

export type RunnerView = {
  /** Размер канвы (drawing buffer) в пикселях. */
  canvasW: number;
  canvasH: number;
  /** Размер области в логических (css) пикселях. */
  logicalW: number;
  logicalH: number;
  dpr: number;
  /** На web дизеринговые фоны рисуются в уменьшенную канву (1 пиксель = 1 клетка) и растягиваются. */
  cellIsPixel: boolean;
};

export const baseCss = (dark: boolean) => (dark ? 'rgb(12,12,16)' : 'rgb(236,237,241)');

export type RunnerPointer = { x: number; y: number; s: number } | null;

export interface Runner {
  /** Нужен ли рендер в уменьшенном разрешении (размер клетки в css-пикселях), иначе 0. */
  lowResCell: number;
  draw(timeSec: number, view: RunnerView, pointer: RunnerPointer): void;
  dispose(): void;
}

const baseColor = (dark: boolean): [number, number, number] => (dark ? [0.047, 0.047, 0.063] : [0.925, 0.93, 0.945]);

function begin(gl: GL, view: RunnerView, dark: boolean) {
  const b = baseColor(dark);
  gl.viewport(0, 0, view.canvasW, view.canvasH);
  gl.clearColor(b[0], b[1], b[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

const STATIC_TIME = 14.0; // красивый «кадр» для неанимированного режима
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));

function compile(gl: GL, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? '';
    gl.deleteShader(sh);
    throw new Error(`shader: ${log.slice(0, 300)}`);
  }
  return sh;
}

function program(gl: GL, fragment: string) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${(gl.getProgramInfoLog(p) ?? '').slice(0, 300)}`);
  const cache = new Map<string, WebGLUniformLocation | null>();
  const loc = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(p, name));
    return cache.get(name) ?? null;
  };
  return {
    use: () => gl.useProgram(p),
    f1: (n: string, v: number) => gl.uniform1f(loc(n), v),
    f2: (n: string, a: number, b: number) => gl.uniform2f(loc(n), a, b),
    f3: (n: string, a: number, b: number, c: number) => gl.uniform3f(loc(n), a, b, c),
    i1: (n: string, v: number) => gl.uniform1i(loc(n), v),
    f3v: (n: string, v: Float32Array) => gl.uniform3fv(loc(n), v),
    dispose: () => gl.deleteProgram(p),
  };
}

/* ------------------------------------------------------------ Aurora ---- */

const toOklch = (rgb: [number, number, number]): [number, number, number] => {
  const [r, g, b] = rgb.map((c) => toLinear(c)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lab = [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
  return [lab[0], Math.hypot(lab[1], lab[2]), Math.atan2(lab[2], lab[1])];
};

const unwrapHues = (stops: [number, number, number][]): [number, number, number][] => {
  const known = stops.findIndex((s) => s[1] > 0.02);
  let previous = known === -1 ? 0 : stops[known][2];
  return stops.map((s) => {
    let hue = s[1] > 0.02 ? s[2] : previous;
    while (hue - previous > Math.PI) hue -= Math.PI * 2;
    while (hue - previous < -Math.PI) hue += Math.PI * 2;
    previous = hue;
    return [s[0], s[1], hue];
  });
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function auroraStops(color: string | null): string[] {
  if (!color) return ['#8d9299', '#ffffff', '#5d6167']; // монохром
  const [r, g, b] = hexToRgb(color);
  const hex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  const light = `#${hex(mix(r, 1, 0.45))}${hex(mix(g, 1, 0.45))}${hex(mix(b, 1, 0.45))}`;
  return [color, light, color];
}

function createAurora(gl: GL, s: ProceduralSettings, dark: boolean): Runner {
  const p = program(gl, AURORA_FRAGMENT);
  const stops = auroraStops(s.color);
  const palette = new Float32Array(15);
  unwrapHues(stops.map((c) => toOklch(hexToRgb(c)))).forEach((st, i) => palette.set(st, i * 3));
  return {
    lowResCell: 0,
    draw(t, view) {
      begin(gl, view, dark);
      p.use();
      p.f2('uResolution', view.canvasW, view.canvasH);
      p.f1('uTime', s.animated ? t : STATIC_TIME);
      p.f3v('uStops', palette);
      p.i1('uStopCount', stops.length);
      p.f1('uAmplitude', 1);
      p.f1('uBlend', 0.5);
      p.f1('uHeight', 0.45);
      p.f1('uScale', 1);
      p.f1('uGlow', 0.6);
      p.f1('uBrightness', 1);
      p.i1('uLayers', 2);
      p.f1('uFlip', 0);
      p.f3('uPointer', 0, 0.5, 0);
      p.f1('uReveal', 1);
      p.f1('uOpacity', 1);
      p.f1('uLightMode', dark ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: () => p.dispose(),
  };
}

/* ------------------------------------------------------------ Dither ---- */

const DITHER_PIXEL = 3; // параметры из выбранного пресета: pixelSize=3, waveSpeed=0.095, mouseStrength=1.45

function createDither(gl: GL, s: ProceduralSettings, dark: boolean): Runner {
  const p = program(gl, DITHER_FRAGMENT);
  const wave = s.color ? hexToRgb(s.color) : ([0.66, 0.68, 0.72] as [number, number, number]);
  return {
    lowResCell: DITHER_PIXEL,
    draw(t, view, pointer) {
      begin(gl, view, dark);
      p.use();
      p.f2('uLogical', view.logicalW, view.logicalH);
      p.f1('uCell', view.cellIsPixel ? 1 : DITHER_PIXEL * view.dpr);
      p.f1('uCellLogical', DITHER_PIXEL);
      p.f1('uTime', s.animated ? t : STATIC_TIME);
      p.f1('uWaveSpeed', 0.095);
      p.f1('uWaveFrequency', 3);
      p.f1('uWaveAmplitude', 0.3);
      p.f1('uScale', 1);
      p.f1('uContrast', 1);
      p.f1('uBrightness', 0);
      p.f1('uColorNum', 4);
      p.f3('uWave', wave[0], wave[1], wave[2]);
      p.f3('uBackground', 0, 0, 0);
      p.f1('uStrength', 1.45);
      p.f1('uRadius', 1);
      if (pointer && s.animated) p.f3('uTouch', pointer.x, view.logicalH - pointer.y, pointer.s);
      else p.f3('uTouch', 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: () => p.dispose(),
  };
}

/* -------------------------------------------------------- Pixel Blast --- */

function createPixelBlast(gl: GL, s: ProceduralSettings, dark: boolean): Runner {
  const p = program(gl, PIXELBLAST_FRAGMENT);
  const color = s.color ? hexToRgb(s.color) : dark ? ([0.86, 0.88, 0.92] as [number, number, number]) : ([0.25, 0.27, 0.32] as [number, number, number]);
  return {
    lowResCell: 0,
    draw(t, view, pointer) {
      begin(gl, view, dark);
      p.use();
      p.f2('uCanvas', view.canvasW, view.canvasH);
      p.f1('uCell', 5 * view.dpr);
      p.f1('uTime', s.animated ? t : STATIC_TIME);
      p.f3('uColor', color[0], color[1], color[2]);
      p.i1('uShape', 0);
      p.f1('uScale', 1);
      if (pointer && s.animated) p.f3('uTouch', pointer.x * view.dpr, view.canvasH - pointer.y * view.dpr, pointer.s);
      else p.f3('uTouch', 0, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose: () => p.dispose(),
  };
}

export function createRunner(gl: GL, settings: ProceduralSettings, dark = true): Runner {
  switch (settings.id) {
    case 'aurora':
      return createAurora(gl, settings, dark);
    case 'dither':
      return createDither(gl, settings, dark);
    default:
      return createPixelBlast(gl, settings, dark);
  }
}
