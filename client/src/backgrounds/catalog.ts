/**
 * Процедурные фоны (по мотивам React Bits: Aurora, Dither, Pixel Blast).
 * Хранятся в обычных полях фона чата/профиля: objectId = `proc:<id>`, key = JSON настроек,
 * mime = application/x-kinto-bg — поэтому схема БД и API не менялись.
 */
import type { AvatarInfo } from '../data/api';

export const PROCEDURAL_MIME = 'application/x-kinto-bg';

export type ProceduralId = 'aurora' | 'dither' | 'pixelblast';

export type ProceduralSettings = {
  id: ProceduralId;
  /** Акцентный цвет (hex) или null — монохром. */
  color: string | null;
  /** Анимация (по умолчанию выключена: статичный кадр экономит батарею). */
  animated: boolean;
};

export const PROCEDURAL_LIBRARY: { id: ProceduralId; title: string; hint: string }[] = [
  { id: 'aurora', title: 'Aurora', hint: 'Плавное северное сияние' },
  { id: 'dither', title: 'Dither', hint: 'Пиксельные волны с растром' },
  { id: 'pixelblast', title: 'Pixel Blast', hint: 'Пиксельный узор из фигур' },
];

export function isProcedural(info?: AvatarInfo | null): boolean {
  return Boolean(info && info.mime === PROCEDURAL_MIME && info.objectId.startsWith('proc:'));
}

export function parseProcedural(info?: AvatarInfo | null): ProceduralSettings | null {
  if (!info || !isProcedural(info)) return null;
  const id = info.objectId.slice(5) as ProceduralId;
  if (!PROCEDURAL_LIBRARY.some((p) => p.id === id)) return null;
  try {
    const raw = JSON.parse(info.key) as { c?: string | null; a?: boolean };
    return { id, color: typeof raw.c === 'string' && /^#[0-9a-f]{6}$/i.test(raw.c) ? raw.c : null, animated: Boolean(raw.a) };
  } catch {
    return { id, color: null, animated: false };
  }
}

export function makeProcedural(s: ProceduralSettings): { objectId: string; key: string; mime: string } {
  return { objectId: `proc:${s.id}`, key: JSON.stringify({ c: s.color, a: s.animated }), mime: PROCEDURAL_MIME };
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}
