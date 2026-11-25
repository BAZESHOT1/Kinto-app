# Kinto

Мессенджер нового поколения с децентрализованным хранением

В этом репозитории — **открытая часть проекта**:

```
client/    — приложение (Expo/React Native): web, iOS, Android
firmware/  — прошивки ESP32-модулей KMesh_v1 (klinto_core) и референс модуля
.github/   — сборки: Android APK, unsigned IPA, тесты KMesh
```


## Приложение

- **Web**: `npm ci && npm run build:web` в `client/` — статика в `client/dist`.
- **Android**: workflow **Android APK** собирает и подписывает APK.
- **iOS**: workflow **iOS unsigned IPA** собирает unsigned IPA (установка через
  Sideloadly со своим Apple ID, переподпись раз в 7 дней).
- Локальный запуск: `npm ci && npm start` в `client/`.

BLE (модули KMesh) работает только в native-сборке — Expo Go и Safari
не поддерживают Web Bluetooth.

## Прошивки ESP32

- `firmware/klinto_core` — ядро KMesh_v1: радио (ESP-NOW + LoRa), mesh-маршрутизация,
  BLE-транспорт, OTA с двумя слотами, шифрование. Хост-тесты: `make test`
  (запускаются в workflow **KMesh_v1 core**).
- `firmware/messenger_module` — референс-прошивка модуля на JSONL-протоколе.
- Прошивка из браузера: Web Serial + esptool-js на HTTPS-странице приложения
  (визард в приложении: Профиль → Мои модули).

Ключи шифрования и подписи OTA в исходники не входят: приватный ключ подписи
OTA — только на сервере сборки, публичная часть вшита в прошивку
(`klinto_ota_pubkey.h`).

## Безопасность

Сквозное шифрование: ключи чатов не покидают устройства; сервер видит только
метаданные и шифротексты. О найденных уязвимостях — в issues (приватно) или
на почту проекта.
