# Самостоятельная сборка и прошивка ESP32 для KMesh

Это руководство — для тех, кто хочет прошить плату **самостоятельно**: плата не
поддержана серверным сборщиком, хочется свою раскладку пинов или собрать
кастомную версию. Прошить можно любую плату на ESP32/C3/S2/S3/C6 — ядро
`klinto_core` переносимое (C++11, условная компиляция `#if defined(ESP32)`).

Прошивка из браузера (без установки инструментов) тоже доступна: визард в
приложении — **Профиль → Мои модули** (Web Serial + esptool-js, только Chrome/Edge
на десктопе). Это руководство — про полный контроль через `arduino-cli`.

## Что понадобится

- плата ESP32 (DevKit или своя разводка) + USB-кабель с данными;
- опционально LoRa-модуль: SX1262 (C3/S3/C6/C5) или SX1278 (классический ESP32);
- [arduino-cli](https://arduino.github.io/arduino-cli/latest/installation/) 1.1.1+;
- Python 3 (для esptool при ручной записи);
- исходники этого репозитория: `firmware/klinto_core`.

## Шаг 1. Исходники и структура скетча

```bash
git clone https://github.com/BAZESHOT1/Kinto-app
cd Kinto-app/firmware/klinto_core
```

Arduino собирает всё из корня скетча, поэтому соберите папку так:

```
klinto_module/                 ← папка скетча (имя = имя .ino)
  klinto_module.ino            ← копия klinto_module_kmesh_v1.ino
  config.h                     ← ваш конфиг (шаг 3)
  partitions.csv               ← таблица разделов (шаг 4)
  klinto_*.h, klinto_*.cpp ... ← всё из include/ и src/ (в корень, не во вложенные папки)
```

```bash
mkdir klinto_module && cd klinto_module
cp ../klinto_module_kmesh_v1.ino klinto_module.ino
cp ../src/*.c ../src/*.cpp ../src/*.h ../include/*.h .
```

## Шаг 2. Установка инструментов

```bash
arduino-cli config init
arduino-cli core update-index
arduino-cli core install esp32:esp32 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
# 3.x обязательна: код ESP-NOW в klinto_core использует API ядра 3.x
arduino-cli core install esp32:esp32@3.3.12 --additional-urls https://espressif.github.io/arduino-esp32/package_esp32_index.json

arduino-cli lib install RadioLib@8.0.0
arduino-cli lib install NimBLE-Arduino@2.5.2
arduino-cli lib install ArduinoJson@7.4.3
arduino-cli lib install LoRa@0.8.0
```

> Ядро **3.x обязательно**: код ESP-NOW в klinto_core использует API ядра 3.x
> (`esp_now_recv_info_t`). На 2.0.17 сборка не пройдёт.

## Шаг 3. config.h

`config.h` — единственный файл, который вы пишете сами. Ровно этот формат
генерирует серверный сборщик (`Профиль → Мои модули → Собрать прошивку`), можно
собрать прошивку в приложении один раз и подсмотреть сгенерированный config.h.

Минимальный пример — носимый узел, Wi-Fi mesh + BLE:

```c
// config.h — Klinto KMesh_v1
#pragma once

#define KL_FIRMWARE_VERSION "1.0.0-self"
#define KL_BOARD "esp32c3"
#define KL_ROLE "wearable"            // gateway | wearable | repeater
#define KL_HYBRID_PORTABLE 1
#define KL_RELAY_ALLOWED 1
#define KL_CHIP_ARCH 2                // 1=esp32, 2=esp32c3, 3=esp32s3, 4=esp32c6, 5=esp32s2, 6=esp32c5
#define KL_FIRMWARE_BUILD 1           // монотонно растёт для OTA
#define KL_HAS_LORA 1                 // компилируется всегда, включается настройкой
#define KL_HAS_BLE 1
#define KL_HAS_MQTT 0
#define KL_OTA_PUBKEY_HEX "04ad46fe1fb1613d7311e0059cd444f828c1cde953f1f2571c0fb1f55386b7703a5c390d955a11e4b01763eaad97906a36e3b6b21159d5db2b5626c995f8a54666"
#define KL_CONNECTIVITY "wifi_lora"   // wifi | lora | wifi_lora
#define KL_MODULE_NAME "мой-модуль"
#define KL_IS_GATEWAY 0
#define KL_IS_WEARABLE 1
#define KL_USE_WIFI_MESH 1
#define KL_USE_ESP_MESH 0
#define KL_MESH_V2 0
#define KL_KMESH_V1 1

// --- подключение к Hub ---
#define KL_HUB_URL "https://hub.kintoapp.xyz"
#define KL_MODULE_TOKEN ""            // токен модуля (шаг 6), можно вписать позже через NVS
#define KL_TEMP_MESH_KEY "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

// --- радио ---
#define KL_USE_LORA 1
#define KL_OTA 1                      // OTA-обновления (не для deep-sleep носимых)
#define KL_DEEP_SLEEP 0
#define KL_LORA_CHIP "sx1262"
#define KL_LORA_CHIP_SX1262 1
#define KL_LORA_CHIP_ID 1
#define KL_LORA_FREQ 869.525
#define KL_LORA_SF 7
#define KL_LORA_BW 250.0
#define KL_LORA_CR 5
#define KL_LORA_SYNC 0x12
#define KL_LORA_POWER 17
// пины LoRa по умолчанию для esp32c3: sck 4, miso 5, mosi 6, cs 7, rst 3, dio0 2, busy 10
#define KL_LORA_SCK 4
#define KL_LORA_MISO 5
#define KL_LORA_MOSI 6
#define KL_LORA_CS 7
#define KL_LORA_RST 3
#define KL_LORA_DIO0 2
#define KL_LORA_BUSY 10

// --- Wi-Fi mesh (скрытая сеть, у всех узлов одной mesh — одинаковые) ---
#define KL_WIFI_SSID ""               // домашний Wi-Fi (только для gateway)
#define KL_WIFI_PASS ""
#define KL_MESH_SSID "SG-MESH"
#define KL_MESH_PASS "sgmesh-2026-11-11-a7f3c9d2e6b14580"
#define KL_MESH_ID "SG-MESH"
#define KL_MESH_HIDDEN 0
#define KL_MESH_CHANNEL 11
#define KL_WIFI_MAX_HOPS 14
#define KL_LORA_MAX_HOPS 12

// --- батарея (0 = нет) ---
#define KL_BATT_ENABLED 0
#define KL_BATT_PIN 0
#define KL_BATT_CHARGING_PIN -1
#define KL_BATT_RATIO 2.0
#define KL_LED_PIN -1
#define KL_BATT_INTERVAL 300
```

### Ключевые параметры

| Параметр | Что это | Где взять |
|---|---|---|
| `KL_KMESH_V1 1` | новый dual-band стек (klinto_core) | всегда 1 |
| `KL_TEMP_MESH_KEY` | транспортный ключ mesh, 64 hex (32 байта). **Одинаковый у всех узлов одной mesh** — не путать с E2EE-ключами чатов | API модуля (шаг 6) или серверный сборщик |
| `KL_MODULE_TOKEN` | токен регистрации модуля на Hub | API модуля (шаг 6) |
| `KL_HUB_URL` | адрес Hub | `https://hub.kintoapp.xyz` или свой |
| `KL_ROLE` | `gateway` (Wi-Fi+Hub), `wearable` (носимый), `repeater` (ретранслятор) | ваша роль |
| `KL_OTA` | два OTA-слота, обновления по радио | выключите для deep-sleep |
| `KL_LORA_*` пины | раскладка SPI вашего LoRa-модуля | даташит платы |

Пины LoRa по умолчанию по платам (если не переопределить):

| Плата | sck | miso | mosi | cs | rst | dio0 | busy | чип |
|---|---|---|---|---|---|---|---|---|
| esp32c3/c6/c5 | 4 | 5 | 6 | 7 | 3 | 2 | 10 | sx1262 |
| esp32 (classic) | 18 | 19 | 23 | 5 | 14 | 26 | 27 | sx1278 |
| esp32s3 | 12 | 13 | 11 | 10 | 9 | 8 | 7 | sx1262 |

## Шаг 4. partitions.csv

Прошивка использует два OTA-слота + LittleFS. Положите рядом со скетчем
`partitions.csv` (в Arduino IDE — Partition Scheme: **Custom**).

**4 МБ, классический ESP32 с BLE (Bluedroid)** — слоты по 1.875 МБ:

```csv
# Name,     Type,  SubType, Offset,   Size,     Flags
nvs,      data,  nvs,     0x9000,    0x5000,
otadata,  data,  ota,     0xe000,    0x2000,
app0,     app,   ota_0,   0x10000,   0x1E0000,
app1,     app,   ota_1,   0x1F0000,  0x1E0000,
spiffs,   data,  spiffs,  0x3D0000,  0x30000,
```

**4 МБ, остальные (BLE NimBLE)** — слоты по 1.75 МБ + 448 КБ LittleFS:

```csv
# Name,     Type,  SubType, Offset,   Size,     Flags
nvs,      data,  nvs,     0x9000,    0x5000,
otadata,  data,  ota,     0xe000,    0x2000,
app0,     app,   ota_0,   0x10000,   0x1C0000,
app1,     app,   ota_1,   0x1D0000,  0x1C0000,
spiffs,   data,  spiffs,  0x390000,  0x70000,
```

**8/16 МБ (esp32s3)** — слоты по 3.125 МБ:

```csv
# Name,     Type,  SubType, Offset,   Size,     Flags
nvs,      data,  nvs,     0x9000,    0x5000,
otadata,  data,  ota,     0xe000,    0x2000,
app0,     app,   ota_0,   0x10000,   0x320000,
app1,     app,   ota_1,   0x330000,  0x320000,
spiffs,   data,  spiffs,  0x650000,  0x1A0000,
coredump, data,  coredump,0x7F0000,  0x10000,
```

## Шаг 5. Компиляция

Флаги обязательны — без них прошивка с BLE не влезает в OTA-слот:

```bash
arduino-cli compile \
  --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc \
  --build-path build \
  --output-dir out \
  --build-property "upload.maximum_size=0x1C0000" \
  --build-property "compiler.cpp.extra_flags=-Os -ffunction-sections -fdata-sections -fno-rtti -fno-exceptions -fno-unwind-tables -fno-asynchronous-unwind-tables -DNDEBUG -DCORE_DEBUG_LEVEL=0 -DCONFIG_BT_NIMBLE_ROLE_CENTRAL_DISABLED=1 -DCONFIG_BT_NIMBLE_ROLE_OBSERVER_DISABLED=1 -DCONFIG_BT_NIMBLE_MAX_CONNECTIONS=1 -DCONFIG_BT_NIMBLE_LOG_LEVEL=0 -DRADIOLIB_EXCLUDE_CC1101=1 -DRADIOLIB_EXCLUDE_NRF24=1 -DRADIOLIB_EXCLUDE_RF69=1 -DRADIOLIB_EXCLUDE_SX1231=1 -DRADIOLIB_EXCLUDE_SX128X=1 -DRADIOLIB_EXCLUDE_SI443X=1 -DRADIOLIB_EXCLUDE_RFM2X=1 -DRADIOLIB_EXCLUDE_STM32WLX=1 -DRADIOLIB_EXCLUDE_APRS=1 -DRADIOLIB_EXCLUDE_AX25=1 -DRADIOLIB_EXCLUDE_MORSE=1 -DRADIOLIB_EXCLUDE_RTTY=1 -DRADIOLIB_EXCLUDE_SSTV=1 -DRADIOLIB_EXCLUDE_AFSK=1 -DRADIOLIB_EXCLUDE_HELLSCHREIBER=1 -DRADIOLIB_EXCLUDE_LORAWAN=1 -DRADIOLIB_EXCLUDE_FSK4=1 -DRADIOLIB_EXCLUDE_BELL=1 -DRADIOLIB_EXCLUDE_PAGER=1 -DRADIOLIB_EXCLUDE_LR11X0=1" \
  --build-property "compiler.c.extra_flags=-Os -ffunction-sections -fdata-sections -fno-rtti -fno-exceptions -fno-unwind-tables -fno-asynchronous-unwind-tables -DNDEBUG -DCORE_DEBUG_LEVEL=0" \
  klinto_module
```

FQBN по платам (как у серверного сборщика):

| Плата | FQBN |
|---|---|
| esp32c3 | `esp32:esp32:esp32c3:CDCOnBoot=cdc` |
| esp32 | `esp32:esp32:esp32` |
| esp32s3 | `esp32:esp32:esp32s3:CDCOnBoot=cdc` |
| esp32c6 | `esp32:esp32:esp32c6:CDCOnBoot=cdc` |
| esp32c5 | `esp32:esp32:esp32c5:CDCOnBoot=cdc` |

Для классического ESP32 с BLE Bluedroid поднимите `upload.maximum_size` до
`0x1E0000` и возьмите «большую» таблицу разделов выше.

## Шаг 6. Регистрация модуля и ключи

Чтобы модуль появился в приложении и мог регистрироваться на Hub:

1. В приложении: **Профиль → Мои модули → добавить модуль** — модуль получит
   `moduleToken` и сохранённую конфигурацию.
2. Конфигурацию модуля (hubUrl, токен, mesh-настройки) можно получить по API:

   ```
   GET https://hub.kintoapp.xyz/v1/modules/<MODULE_ID>/firmware-config
   Authorization: Bearer <ваш access-токен из приложения>
   ```

   Ответ содержит `config` (hubUrl, moduleToken, mesh) и `tempKey` —
   транспортный ключ mesh для `KL_TEMP_MESH_KEY`.
3. Вписайте `moduleToken` и `tempKey` в `config.h` и пересоберите — либо
   оставьте `KL_MODULE_TOKEN ""`: токен можно задать позже через NVS/BLE
   (модуль сам запросит его у приложения при сопряжении).

Транспортный ключ mesh (`tempKey`) — общий для всех узлов одной mesh-сети и не
является ключом шифрования сообщений: содержимое чатов защищено E2EE, ключи
которых не покидают устройства.

## Шаг 7. Прошивка через USB

```bash
# определить порт (Linux: /dev/ttyUSB0 или /dev/ttyACM0, Windows: COM5)
arduino-cli board list

arduino-cli upload -p /dev/ttyUSB0 --fqbn esp32:esp32:esp32c3:CDCOnBoot=cdc \
  --input-dir out klinto_module
```

Или через esptool (merged-бинарник с 0x0):

```bash
pip install esptool
esptool.py --chip esp32c3 --port /dev/ttyUSB0 --baud 460800 \
  write_flash 0x0 out/klinto_module.ino.merged.bin
```

## Шаг 8. Проверка

```bash
# Serial-лог (C3/S3/C6/C5: USB CDC, 115200)
arduino-cli monitor -p /dev/ttyUSB0 --config 115200
```

Ожидаем: загрузка ядра, подключение к mesh (Wi-Fi/LoRa), регистрация на Hub.
Затем в приложении: **Профиль → Мои модули** — модуль должен появиться онлайн.

## Добавление своей платы

Ядро переносимое: добавьте плату в `KL_BOARD`/`KL_CHIP_ARCH`, задайте пины
LoRa и, если нужен BLE, убедитесь что чип поддерживает Bluetooth (esp32s2 —
нет). Хост-тесты ядра запускаются без железа: `make test` в
`firmware/klinto_core` (тот же прогон в CI — workflow **KMesh_v1 core**).

## Troubleshooting

| Симптом | Причина / решение |
|---|---|
| `sketch too big` | не хватает флагов `-Os`/excludes (шаг 5) или не та таблица разделов |
| RadioLib не собирается | проверьте версию ядра: код требует 3.x (см. шаг 2) |
| модуль не виден в приложении | проверьте `KL_MODULE_TOKEN`/`tempKey` (шаг 6) и что Hub доступен с платы |
| нет Serial-логов на C3 | включён `CDCOnBoot=cdc`, USB-кабель с данными |
| OTA не работает | `KL_OTA 1` + таблица с app0/app1; в deep sleep OTA недоступна |
