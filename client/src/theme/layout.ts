/**
 * Единая система геометрии Kinto.
 *
 * Все отступы/радиусы/ширины контента берутся отсюда. Платформенные отличия
 * допускаются только там, где их реально диктует система (safe area),
 * и только через useLayoutInsets — никогда через Platform.OS в layout-коде.
 */

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  pill: 999,
} as const;

/** Максимальная ширина контентной колонки (чат/лента/профиль). */
export const CONTENT_MAX_WIDTH = 900;

/** Геометрия плавающего дока — единственный источник для зазоров снизу. */
export const DOCK_HEIGHT = 60;
export const DOCK_BOTTOM_GAP = 12;
/** Отступ снизу у скроллящихся экранов, чтобы последний элемент не прятался под док. */
export const CONTENT_BOTTOM_PAD = DOCK_HEIGHT + DOCK_BOTTOM_GAP + spacing.lg;

/** Горизонтальный отступ экрана на телефоне. */
export const SCREEN_X = spacing.md;
/** Дополнительный отступ справа на широких экранах. */
export const WIDE_RIGHT_X = spacing.lg;

/** Единая шкала ширины контента (вместо 460/470/520/720/860/900/940/1120). */
export const contentWidth = {
  auth: 460,
  form: 560,
  settings: 720,
  chat: 900,
  sheet: 520,
  modal: 440,
  profile: 1120,
} as const;

/** Вертикальный ритм. */
export const rhythm = {
  sectionGap: 18,
  sectionHeadGap: spacing.xs,
  hintGap: spacing.xs,
  rowGap: spacing.sm,
} as const;

export const modal = {
  maxWidth: contentWidth.modal,
  padding: spacing.lg - spacing.xxs,
  radius: radius.lg,
  backdropPadding: spacing.lg,
} as const;

export const sheet = {
  maxWidth: contentWidth.sheet,
  paddingHorizontal: spacing.sm,
  radius: radius.lg,
} as const;

/** Отступ снизу для скроллящихся списков с плавающим доком. */
export function listBottomReserve(insetsBottom: number): number {
  return Math.max(CONTENT_BOTTOM_PAD, DOCK_HEIGHT + DOCK_BOTTOM_GAP + insetsBottom + spacing.lg);
}
