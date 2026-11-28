/**
 * Аудиосессия звонка. Web и Windows (в браузерной оболочке): отдельная настройка не нужна,
 * маршрутизацией вывода управляет ОС/браузер.
 */
export const supportsSpeakerToggle = false;
export async function startCallAudioSession(): Promise<void> {}
export async function stopCallAudioSession(): Promise<void> {}
export async function setSpeakerphone(_on: boolean): Promise<void> {}
