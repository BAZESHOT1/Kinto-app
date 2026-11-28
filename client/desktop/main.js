/**
 * Kinto для Windows — оболочка Electron вокруг web-клиента (тот же код, что в браузере).
 *
 *  - Web-бандл лежит внутри приложения и открывается по схеме app://kinto (работает и без интернета: BLE и kMesh).
 *  - API: https://kintoapp.xyz/api (бандл собирается с EXPO_PUBLIC_API_URL); CORS для схемы app:// разрешаем ответами.
 *  - BLE: Web Bluetooth Chromium + выбор устройства своим диалогом.
 *  - Уведомления: системные toast Windows; приложение живёт в трее и держит соединение с Hub, поэтому
 *    сообщения и входящие звонки показываются и при свёрнутом окне.
 *  - Звонки: WebRTC (LiveKit) и микрофон разрешены; шумоподавление RNNoise включено в клиенте.
 */
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, protocol, net, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_ID = 'xyz.kintoapp.desktop';
const API_ORIGIN = 'https://kintoapp.xyz';
const DIST = path.join(__dirname, 'web');

app.setAppUserModelId(APP_ID);
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, allowServiceWorkers: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let quitting = false;

function iconPath() {
  const p = path.join(__dirname, 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

function serveFile(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  let file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const html = file + '.html';
    // Маршруты expo-router: /chats → chats.html, иначе SPA-фоллбэк на index.html.
    file = fs.existsSync(html) ? html : path.join(DIST, 'index.html');
  }
  return net.fetch(pathToFileURL(file).toString());
}

function pickBluetoothDevice(webContents) {
  // Web Bluetooth присылает устройства по мере сканирования: ждём 3 с и показываем список.
  let found = new Map();
  let pending = null;
  let timer = null;
  const finish = (id) => {
    clearTimeout(timer);
    const cb = pending;
    pending = null;
    found = new Map();
    if (cb) cb(id || '');
  };
  webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    devices.forEach((d) => found.set(d.deviceId, d.deviceName || d.deviceId));
    if (!pending) {
      pending = callback;
      timer = setTimeout(async () => {
        const entries = [...found.entries()].slice(0, 8);
        if (!entries.length) return finish('');
        const { response } = await dialog.showMessageBox(win, {
          type: 'question',
          title: 'Носимый модуль',
          message: 'Выберите модуль для подключения по Bluetooth',
          buttons: [...entries.map(([, name]) => name), 'Отмена'],
          cancelId: entries.length,
          noLink: true,
        });
        finish(response < entries.length ? entries[response][0] : '');
      }, 3000);
    } else {
      pending = callback;
    }
  });
  session.defaultSession.setBluetoothPairingHandler((details, callback) => {
    // Модули Kinto подключаются без PIN: подтверждаем стандартное сопряжение Windows.
    callback({ confirmed: true });
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#000000',
    title: 'Kinto',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Приложение держит соединение с Hub в фоне: окно в трее не должно «засыпать».
      backgroundThrottling: false,
      experimentalFeatures: true,
    },
  });
  Menu.setApplicationMenu(null);
  pickBluetoothDevice(win.webContents);
  win.loadURL('app://kinto/');
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
  });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const img = iconPath() ? nativeImage.createFromPath(iconPath()).resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
  tray = new Tray(img);
  tray.setToolTip('Kinto');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Открыть Kinto', click: showWindow },
    { type: 'separator' },
    { label: 'Выход', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

app.on('second-instance', showWindow);
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  protocol.handle('app', serveFile);

  // Разрешения: микрофон (звонки), уведомления, Bluetooth.
  const allowed = new Set(['media', 'audioCapture', 'notifications', 'bluetooth', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  session.defaultSession.setDevicePermissionHandler((details) => details.deviceType === 'bluetooth' || details.deviceType === 'hid' ? true : false);

  // API живёт на другом origin: добавляем CORS-заголовки к ответам Hub для схемы app://.
  session.defaultSession.webRequest.onHeadersReceived({ urls: [`${API_ORIGIN}/*`] }, (details, cb) => {
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) if (k.toLowerCase().startsWith('access-control-')) delete headers[k];
    headers['Access-Control-Allow-Origin'] = ['app://kinto'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Allow-Methods'] = ['GET, POST, PUT, PATCH, DELETE, OPTIONS'];
    headers['Access-Control-Allow-Credentials'] = ['true'];
    if (details.method === 'OPTIONS') cb({ responseHeaders: headers, statusLine: 'HTTP/1.1 204 No Content' });
    else cb({ responseHeaders: headers });
  });

  createWindow();
  createTray();

  // Страница сообщает о входящем звонке: поднимаем окно и показываем системное уведомление.
  ipcMain.on('kinto:incoming-call', (_e, payload) => {
    const name = String(payload?.name || 'Kinto');
    const n = new Notification({ title: 'Входящий звонок', body: `${name} звонит вам`, icon: iconPath(), urgency: 'critical' });
    n.on('click', showWindow);
    n.show();
    showWindow();
  });
  ipcMain.on('kinto:notify', (_e, payload) => {
    const n = new Notification({ title: String(payload?.title || 'Kinto'), body: String(payload?.body || ''), icon: iconPath() });
    n.on('click', showWindow);
    n.show();
  });
});

app.on('window-all-closed', () => {
  // Остаёмся в трее.
});
