import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '../theme/useTheme';

/** Синхронизирует фон <body> с темой (иначе под обводкой всех компонентов виден белый). */
export function useBodyBackground(): void {
  const theme = useTheme();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const b = document.body;
    const h = document.documentElement;
    b.style.backgroundColor = theme.background;
    h.style.backgroundColor = theme.background;
    b.style.color = theme.textPrimary;
    // Safari/Chrome красят системные панели (адресная строка, нижний тулбар) по theme-color и color-scheme.
    h.style.colorScheme = theme.dark ? 'dark' : 'light';
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', theme.background);
  }, [theme.background, theme.textPrimary, theme.dark]);
}
