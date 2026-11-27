import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** HTML-оболочка для web-сборки: тёмный фон по умолчанию, светлый включается из JS. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <meta name="color-scheme" content="dark light" />
        <meta
          name="description"
          content="Kinto — приватный мессенджер на рое узлов: чаты, каналы, секретные диалоги и свои устройства хранения."
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Kinto" />
        <meta name="mobile-web-app-capable" content="yes" />
        <title>Kinto</title>
        <link rel="manifest" href="/manifest.json?v=3" />
        <link rel="icon" href="/favicon.ico?v=3" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/icon.svg?v=3" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=3" />
        <ScrollViewStyleReset />
        {/* Наш стиль ПОСЛЕ сброса expo-router — иначе его height:100% перебивает dvh. */}
        <style
          id="bg-root"
          dangerouslySetInnerHTML={{
            __html: `html,body{margin:0;height:100%;box-sizing:border-box;overflow:hidden;overscroll-behavior:none}html{background:#000;color-scheme:dark}body{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);background:#000;color:#E8F0FA;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}#root{display:flex;height:100%;width:100%;box-sizing:border-box;margin:0}#scaling-root{display:none}*,*::before,*::after{-webkit-tap-highlight-color:transparent}*{scrollbar-width:none}*::-webkit-scrollbar{width:0;height:0;display:none}@media (max-width:900px),(pointer:coarse){input,textarea,select{font-size:16px !important}}`,
          }}
        />
      </head>
      <body>
        {children}
        {/* Документ не должен прокручиваться сам (фокус поля, клавиатура): сбрасываем сдвиг. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var r=function(){if(window.scrollX||window.scrollY)window.scrollTo(0,0);var d=document.documentElement,b=document.body;if(d.scrollTop)d.scrollTop=0;if(b.scrollTop)b.scrollTop=0};window.addEventListener('scroll',r,{passive:true});window.addEventListener('resize',r);document.addEventListener('focusout',function(){setTimeout(r,60)});if(window.visualViewport)window.visualViewport.addEventListener('resize',r)})();`,
          }}
        />
      </body>
    </html>
  );
}
