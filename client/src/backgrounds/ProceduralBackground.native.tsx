/**
 * iOS / Android: тот же GLSL через expo-gl (WebGL2). Статичный кадр по умолчанию, анимация — по настройке (~30 кадров/с).
 */
import React from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { GLView } from 'expo-gl';
import { baseCss, createRunner, type Runner } from './runner';
import type { ProceduralSettings } from './catalog';

export function ProceduralBackground({ settings, dark = true, dim = 0 }: { settings: ProceduralSettings; dark?: boolean; dim?: number }) {
  const stopRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => stopRef.current?.(), []);

  const onContext = (ctx: unknown) => {
    const gl = ctx as WebGL2RenderingContext & { endFrameEXP: () => void };
    let runner: Runner;
    try {
      runner = createRunner(gl, settings, dark);
    } catch (e) {
      console.warn('[bg] shader failed', e);
      return;
    }
    const dpr = PixelRatio.get();
    const view = {
      canvasW: gl.drawingBufferWidth,
      canvasH: gl.drawingBufferHeight,
      logicalW: gl.drawingBufferWidth / dpr,
      logicalH: gl.drawingBufferHeight / dpr,
      dpr,
      cellIsPixel: false,
    };
    let alive = true;
    let raf = 0;
    let clock = 0;
    let last = 0;
    const render = () => {
      runner.draw(clock, view, null);
      gl.endFrameEXP();
    };
    render();
    if (settings.animated) {
      const tick = (now: number) => {
        if (!alive) return;
        if (now - last >= 33) {
          clock += last ? Math.min(0.1, (now - last) / 1000) : 0;
          last = now;
          render();
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    stopRef.current = () => {
      alive = false;
      cancelAnimationFrame(raf);
      try { runner.dispose(); } catch { /* контекст уже закрыт */ }
    };
  };

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: baseCss(dark) }]}>
      <GLView key={`${settings.id}:${settings.color}:${settings.animated}:${dark}`} style={StyleSheet.absoluteFill} onContextCreate={onContext} />
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null}
    </View>
  );
}
