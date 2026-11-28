/**
 * Диагностические флаги звонка (отключают отдельные возможности для поиска причины зависаний).
 * Задаются в ссылке на запуск: klinto://chat/<id>/call?type=direct&df=noq,nowd — только для отладки.
 */
export function callFlag(name: string): boolean {
  const raw = (globalThis as unknown as { __callFlags?: string }).__callFlags ?? '';
  const list = raw.split(',');
  if (list.includes('min') && ['noq', 'nph', 'nowd', 'nopw', 'nokeep', 'nopick'].includes(name)) return true;
  return list.includes(name);
}
export function setCallFlags(raw: string | undefined): void {
  (globalThis as unknown as { __callFlags?: string }).__callFlags = raw ?? '';
}
