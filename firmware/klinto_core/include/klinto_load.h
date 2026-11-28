/**
 * Нагрузка на эфир по каждому транспорту (ESP-NOW и LoRa) — пассивная оценка без служебных пакетов.
 *
 * Узел складывает время в эфире всех кадров, которые он передал и услышал, в скользящее окно 10 секунд
 * (10 корзин по 1 с). Нагрузка = занятое эфирное время / длина окна, в процентах. Эфир общий для всей соты,
 * поэтому оценка узла объективно отражает нагрузку на пропускную способность соты; в эфир она не передаётся —
 * клиент получает её в служебном JSON модуля (поле "ld") по BLE.
 *
 * Время в эфире считается по формуле Semtech (LoRa) и по 1 Мбит/с с накладными расходами 802.11 (ESP-NOW).
 */
#ifndef KLINTO_LOAD_H
#define KLINTO_LOAD_H

#include <stdint.h>

#define KL_LOAD_BUCKETS 10u
#define KL_LOAD_IFACES 2u

struct kl_load_meter_t {
  uint32_t epoch[KL_LOAD_IFACES][KL_LOAD_BUCKETS];   /* секунда корзины (now_ms/1000 + 1; 0 — пусто) */
  uint32_t busy_us[KL_LOAD_IFACES][KL_LOAD_BUCKETS];
};

inline void kl_load_reset(kl_load_meter_t *m) {
  for (uint32_t i = 0; i < KL_LOAD_IFACES; ++i)
    for (uint32_t b = 0; b < KL_LOAD_BUCKETS; ++b) {
      m->epoch[i][b] = 0;
      m->busy_us[i][b] = 0;
    }
}

/** Добавить время в эфире (мкс), iface: 0 — ESP-NOW, 1 — LoRa. */
inline void kl_load_note(kl_load_meter_t *m, uint8_t iface, uint32_t air_us, uint32_t now_ms) {
  if (iface >= KL_LOAD_IFACES) return;
  const uint32_t sec = now_ms / 1000u + 1u;
  const uint32_t b = sec % KL_LOAD_BUCKETS;
  if (m->epoch[iface][b] != sec) {
    m->epoch[iface][b] = sec;
    m->busy_us[iface][b] = 0;
  }
  const uint32_t sum = m->busy_us[iface][b] + air_us;
  m->busy_us[iface][b] = sum < 1000000u ? sum : 1000000u; /* корзина не больше секунды */
}

/** Нагрузка за последние 10 с, 0..100 %. */
inline uint8_t kl_load_percent(const kl_load_meter_t *m, uint8_t iface, uint32_t now_ms) {
  if (iface >= KL_LOAD_IFACES) return 0;
  const uint32_t cur = now_ms / 1000u + 1u;
  uint64_t total = 0;
  for (uint32_t b = 0; b < KL_LOAD_BUCKETS; ++b) {
    const uint32_t e = m->epoch[iface][b];
    if (e && e <= cur && cur - e < KL_LOAD_BUCKETS) total += m->busy_us[iface][b];
  }
  const uint64_t pct = total * 100u / (KL_LOAD_BUCKETS * 1000000ull);
  return (uint8_t)(pct > 100u ? 100u : pct);
}

/** Время в эфире LoRa-кадра, мкс (явный заголовок, CRC вкл., преамбула preamble символов). cr_den: 5..8 (4/5..4/8). */
inline uint32_t kl_lora_airtime_us(uint8_t sf, uint32_t bw_hz, uint8_t cr_den, uint16_t preamble, uint32_t payload_len) {
  if (!bw_hz || sf < 5 || sf > 12) return 0;
  const uint64_t tsym_us = ((uint64_t)1 << sf) * 1000000ull / bw_hz;
  const int de = tsym_us >= 16000ull ? 1 : 0;
  const int cr = (int)(cr_den < 5 ? 1 : cr_den > 8 ? 4 : cr_den - 4);
  const int num = (int)(8 * payload_len) - 4 * (int)sf + 28 + 16;
  const int den = 4 * ((int)sf - 2 * de);
  int syms = num > 0 ? (num + den - 1) / den : 0;
  syms = 8 + syms * (cr + 4);
  /* (преамбула + 4.25 + syms) * Tsym */
  const uint64_t quarter = (uint64_t)preamble * 4u + 17u + (uint64_t)syms * 4u;
  return (uint32_t)(quarter * tsym_us / 4u);
}

/** Время в эфире ESP-NOW-кадра: 1 Мбит/с, ~60 байт заголовков 802.11 + преамбула 192 мкс. */
inline uint32_t kl_espnow_airtime_us(uint32_t frame_len) { return (frame_len + 60u) * 8u + 192u; }

/** Общий счётчик узла (радиодрайверы, роутер и мост используют один). */
inline kl_load_meter_t *kl_load_meter() {
  static kl_load_meter_t m;
  return &m;
}

#endif /* KLINTO_LOAD_H */
