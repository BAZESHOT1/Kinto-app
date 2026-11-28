/**
 * Web / Windows-оболочка: процедурный фон на WebGL2 в <canvas>.
 * По умолчанию статичный кадр; при animated=true — анимация (до 30 кадров/с), пауза в фоновой вкладке.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { baseCss, createRunner, type Runner, type RunnerPointer } from './runner';
import type { ProceduralSettings } from './catalog';

export function ProceduralBackground({ settings, dark = true, dim = 0 }: { settings: ProceduralSettings; dark?: boolean; dim?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false }) as WebGL2RenderingContext | null;
    if (!gl) return undefined;
    let runner: Runner;
    try {
      runner = createRunner(gl, settings, dark);
    } catch (e) {
      console.warn('[bg] shader failed', e);
      return undefined;
    }
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animated = settings.animated && !reduce;
    const pointer: { x: number; y: number; s: number; inside: boolean } = { x: 0, y: 0, s: 0, inside: false };
    let raf = 0;
    let last = 0;
    let clock = 0;
    let view = { canvasW: 1, canvasH: 1, logicalW: 1, logicalH: 1, dpr: 1, cellIsPixel: false };

    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const low = runner.lowResCell > 0;
      canvas.width = low ? Math.max(1, Math.ceil(w / runner.lowResCell)) : Math.max(1, Math.round(w * dpr));
      canvas.height = low ? Math.max(1, Math.ceil(h / runner.lowResCell)) : Math.max(1, Math.round(h * dpr));
      view = { canvasW: canvas.width, canvasH: canvas.height, logicalW: w, logicalH: h, dpr, cellIsPixel: low };
    };
    const draw = () => {
      const ptr: RunnerPointer = animated && pointer.inside ? { x: pointer.x, y: pointer.y, s: pointer.s } : null;
      runner.draw(clock, view, ptr);
    };
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      if (now - last >= 33) {
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
        last = now;
        clock += dt;
        pointer.s += ((pointer.inside ? 1 : 0) - pointer.s) * 0.12;
        draw();
      }
      raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= r.width && pointer.y <= r.height;
    };
    const onLeave = () => { pointer.inside = false; };
    const ro = new ResizeObserver(() => { size(); draw(); });
    ro.observe(canvas);
    size();
    draw();
    if (animated) {
      raf = requestAnimationFrame(frame);
      window.addEventListener('pointermove', onMove, { passive: true });
      document.documentElement.addEventListener('pointerleave', onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      runner.dispose();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [settings.id, settings.color, settings.animated, dark]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: baseCss(dark) }]}>
      {React.createElement('canvas', {
        ref: canvasRef,
        style: { width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' },
      })}
      {dim > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${dim})` }]} /> : null}
    </View>
  );
}
