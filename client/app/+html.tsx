import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
import splash from '../src/web/splashList.json';

/** HTML-оболочка для web-сборки: тёмный фон по умолчанию, светлый включается из JS. */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru" style={{ backgroundColor: '#000000', colorScheme: 'dark' }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <meta name="color-scheme" content="dark" />
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
        <ScrollViewStyleReset />
        {/* Наш стиль ПОСЛЕ сброса expo-router — иначе его height:100% перебивает dvh. */}
        <style
          id="bg-root"
          dangerouslySetInnerHTML={{
            __html: `html,body{margin:0;height:100%;box-sizing:border-box;overflow:hidden;overscroll-behavior:none}html{background:#000;color-scheme:dark}body{position:fixed;top:0;left:0;right:0;width:100%;height:var(--app-h,100%);padding:env(safe-area-inset-top) env(safe-area-inset-right) min(env(safe-area-inset-bottom),34px) env(safe-area-inset-left);background:#000;color:#E8F0FA;-webkit-text-size-adjust:100%;text-size-adjust:100%;touch-action:manipulation}body::after{content:'';position:fixed;left:0;right:0;bottom:-600px;height:600px;background:#000;pointer-events:none;z-index:-1}#root{display:flex;height:100%;width:100%;box-sizing:border-box;margin:0}#scaling-root{display:none}*,*::before,*::after{-webkit-tap-highlight-color:transparent}*{scrollbar-width:none}*::-webkit-scrollbar{width:0;height:0;display:none}@media (max-width:900px),(pointer:coarse){input,textarea,select{font-size:16px !important}}`,
          }}
        />
      </head>
      <body style={{ backgroundColor: '#000000' }}>
        {children}
        {/* Документ не должен прокручиваться сам (фокус поля, клавиатура): сбрасываем сдвиг. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;var standalone=function(){return navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)};var fit=function(){var h=window.innerHeight;if(standalone()){var sh=window.screen&&window.screen.height||0,sw=window.screen&&window.screen.width||0;var portrait=window.innerHeight>=window.innerWidth;var full=portrait?Math.max(sh,sw):Math.min(sh,sw);if(full>h&&full-h<200)h=full}d.style.setProperty('--app-h',h+'px')};var r=function(){if(window.scrollX||window.scrollY)window.scrollTo(0,0);var b=document.body;if(d.scrollTop)d.scrollTop=0;if(b.scrollTop)b.scrollTop=0;fit()};fit();window.addEventListener('scroll',r,{passive:true});window.addEventListener('resize',r);window.addEventListener('orientationchange',function(){setTimeout(r,200)});document.addEventListener('focusout',function(){setTimeout(r,60)});if(window.visualViewport)window.visualViewport.addEventListener('resize',r);var taps=[];var box=null;var probe=function(p){var e=document.createElement('div');e.style.cssText='position:fixed;visibility:hidden;'+p+':env(safe-area-inset-'+p+')';document.body.appendChild(e);var v=parseFloat(getComputedStyle(e)['padding'+p[0].toUpperCase()+p.slice(1)]);e.remove();return v};document.addEventListener('touchstart',function(ev){var t=ev.touches[0];if(!t||t.clientX>70||t.clientY>70)return;var n=Date.now();taps=taps.filter(function(x){return n-x<2500});taps.push(n);if(taps.length>=5){taps=[];if(box){box.remove();box=null;return}box=document.createElement('pre');box.style.cssText='position:fixed;left:8px;right:8px;bottom:120px;z-index:99999;background:rgba(0,0,0,.85);color:#7CFC00;font:11px/1.35 monospace;padding:8px;border-radius:8px;white-space:pre-wrap';var rows=function(){var b=document.body.getBoundingClientRect();var rt=document.getElementById('root').getBoundingClientRect();var vv=window.visualViewport;var tt=['innerH '+innerHeight+' innerW '+innerWidth,'screen '+screen.width+'x'+screen.height,'visualVP '+(vv?Math.round(vv.height)+'+'+Math.round(vv.offsetTop):'-'),'standalone '+standalone(),'app-h '+d.style.getPropertyValue('--app-h'),'body top '+Math.round(b.top)+' bottom '+Math.round(b.bottom),'root top '+Math.round(rt.top)+' bottom '+Math.round(rt.bottom)];box.textContent=tt.join('\n')};rows();document.body.appendChild(box);setInterval(function(){if(box)rows()},1000)}},{passive:true})})();`,
          }}
        />
      </body>
    </html>
  );
}
