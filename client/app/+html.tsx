import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import splash from '../src/web/splashList.json';

/** HTML-оболочка для web-сборки: тёмный фон по умолчанию, светлый включается из JS. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#0A0E14" />
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
        {splash.map((x) => (
          <link
            key={x.file}
            rel="apple-touch-startup-image"
            href={x.file}
            media={`(device-width: ${x.w}px) and (device-height: ${x.h}px) and (-webkit-device-pixel-ratio: ${x.dpr}) and (orientation: portrait)`}
          />
        ))}
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=3" />
    <style
      id="bg-root"
      dangerouslySetInnerHTML={{
        __html: `html,body{margin:0;padding:0;background:#0A0E14;height:var(--app-h,100%);overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}body{color:#E8F0FA;color-scheme:dark}#scaling-root{display:none}#root{height:100%}*,*::before,*::after{-webkit-tap-highlight-color:transparent}[role=button],[role=button] *,button,button *,[role=tab],[role=tab] *,a{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}*{scrollbar-width:none}*::-webkit-scrollbar{width:0;height:0;display:none}@media (max-width:900px),(pointer:coarse){input,textarea,select{font-size:16px !important}html,body{touch-action:manipulation}}`,
      }}
    />
        <ScrollViewStyleReset />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;var standalone=function(){return navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)};var fit=function(){var h=window.innerHeight;if(standalone()){var sh=window.screen&&window.screen.height||0,sw=window.screen&&window.screen.width||0;var full=window.innerHeight>=window.innerWidth?Math.max(sh,sw):Math.min(sh,sw);if(full>h&&full-h<200)h=full}d.style.setProperty('--app-h',h+'px')};var r=function(){if(window.scrollX||window.scrollY)window.scrollTo(0,0);if(d.scrollTop)d.scrollTop=0;if(document.body&&document.body.scrollTop)document.body.scrollTop=0;fit()};fit();window.addEventListener('scroll',r,{passive:true});window.addEventListener('resize',r);window.addEventListener('orientationchange',function(){setTimeout(r,200)});window.addEventListener('pageshow',function(){setTimeout(r,50)});document.addEventListener('visibilitychange',function(){setTimeout(r,100)});document.addEventListener('focusout',function(){setTimeout(r,60)});if(window.visualViewport)window.visualViewport.addEventListener('resize',r)})();`,
          }}
        />
      </body>
    </html>
  );
}
