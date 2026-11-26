/**
 * Единый безопасный копировщик. Раньше на iOS использовался устаревший
 * `Clipboard` из react-native — на нативной сборке модуль отсутствует и
 * `setString` ронял приложение. Теперь везде expo-clipboard.
 */
import { Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    await Clipboard.setStringAsync(value);
    return true;
  } catch {
    return false;
  }
}
