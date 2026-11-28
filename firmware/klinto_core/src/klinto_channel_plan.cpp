#include "klinto_channel_plan.h"

#include <stddef.h>

/*
 * LoRa: SF7 / BW 250 кГц / CR 4/5 (быстрый канал под Codec2-голос).
 *
 * 433 МГц: ISM-диапазон 433.05..434.79 МГц вмещает шесть неперекрывающихся
 * подканалов по 250 кГц (433.175..434.425). Соты 7..13 повторно используют эти
 * частоты; от соседей их отделяет уникальный sync word (чужие кадры не декодируются,
 * но делят эфир — соседние соты на одной частоте лучше не ставить рядом).
 *
 * 868 МГц: восемь подканалов 868.125..869.875 МГц с шагом 250 кГц, соты 9..13
 * повторяют частоты. Допустимый диапазон зависит от страны — при необходимости
 * сократите таблицу.
 */
static const kl_channel_plan_entry_t kPlan433[KL_CHANNEL_COUNT] = {
    {1, 433175000u, 250, 0x11, 7}, {2, 433425000u, 250, 0x12, 7},
    {3, 433675000u, 250, 0x13, 7}, {4, 433925000u, 250, 0x14, 7},
    {5, 434175000u, 250, 0x15, 7}, {6, 434425000u, 250, 0x16, 7},
    {7, 433175000u, 250, 0x17, 7}, {8, 433425000u, 250, 0x18, 7},
    {9, 433675000u, 250, 0x19, 7}, {10, 433925000u, 250, 0x1A, 7},
    {11, 434175000u, 250, 0x1B, 7}, {12, 434425000u, 250, 0x1C, 7},
    {13, 433175000u, 250, 0x1D, 7},
};

static const kl_channel_plan_entry_t kPlan868[KL_CHANNEL_COUNT] = {
    {1, 868125000u, 250, 0x11, 7}, {2, 868375000u, 250, 0x12, 7},
    {3, 868625000u, 250, 0x13, 7}, {4, 868875000u, 250, 0x14, 7},
    {5, 869125000u, 250, 0x15, 7}, {6, 869375000u, 250, 0x16, 7},
    {7, 869625000u, 250, 0x17, 7}, {8, 869875000u, 250, 0x18, 7},
    {9, 868125000u, 250, 0x19, 7}, {10, 868375000u, 250, 0x1A, 7},
    {11, 868625000u, 250, 0x1B, 7}, {12, 868875000u, 250, 0x1C, 7},
    {13, 869125000u, 250, 0x1D, 7},
};

const kl_channel_plan_entry_t *kl_channel_plan_entry(uint8_t wifi_channel, uint8_t band) {
  if (wifi_channel < 1 || wifi_channel > KL_CHANNEL_COUNT) return NULL;
  const kl_channel_plan_entry_t *plan = band == KL_BAND_433 ? kPlan433 : kPlan868;
  return &plan[wifi_channel - 1];
}

uint8_t kl_channel_plan_band_for_freq(float freq_mhz) {
  return freq_mhz > 0.0f && freq_mhz < 500.0f ? KL_BAND_433 : KL_BAND_868;
}

bool kl_channel_plan_apply(kl_config_t *cfg, uint8_t wifi_channel) {
  if (!cfg || wifi_channel < 1 || wifi_channel > KL_CHANNEL_COUNT) return false;
  const uint8_t band = kl_channel_plan_band_for_freq(cfg->lora.freq_mhz);
  const kl_channel_plan_entry_t *entry = kl_channel_plan_entry(wifi_channel, band);
  if (!entry) return false;
  cfg->wifi_channel = wifi_channel;
  cfg->lora.freq_mhz = (float)entry->lora_freq_hz / 1000000.0f;
  cfg->lora.sync_word = entry->lora_sync_word;
  cfg->lora.bw_khz = (float)entry->lora_bw_khz;
  cfg->lora.sf = entry->lora_sf;
  cfg->lora_present = cfg->lora_present;
  return true;
}

uint8_t kl_channel_plan_nearest(float freq_mhz) {
  if (freq_mhz <= 0.0f) return KL_FALLBACK_OFFLINE_CHANNEL;
  const uint8_t band = kl_channel_plan_band_for_freq(freq_mhz);
  const uint32_t hz = (uint32_t)(freq_mhz * 1000000.0f);
  uint8_t best = 1;
  uint32_t best_delta = 0xFFFFFFFFu;
  for (uint8_t ch = 1; ch <= KL_CHANNEL_COUNT; ++ch) {
    const kl_channel_plan_entry_t *entry = kl_channel_plan_entry(ch, band);
    const uint32_t delta = entry->lora_freq_hz > hz ? entry->lora_freq_hz - hz : hz - entry->lora_freq_hz;
    if (delta < best_delta) {
      best_delta = delta;
      best = ch;
    }
  }
  return best;
}
