#include "klinto_channel_plan.h"

#include <stddef.h>

/*
 * LoRa: SF7 / BW 250 кГц / CR 4/5, единственная частота сети 869.525 МГц (433 МГц не используется).
 * Радиосоты 1..13 различаются только sync word (кадры чужой соты не декодируются), поэтому соседние
 * соты делят эфир: ставьте их так, чтобы они не пересекались по зоне покрытия.
 */
static const kl_channel_plan_entry_t kPlan[KL_CHANNEL_COUNT] = {
    {1, 869525000u, 250, 0x11, 7}, {2, 869525000u, 250, 0x12, 7},
    {3, 869525000u, 250, 0x13, 7}, {4, 869525000u, 250, 0x14, 7},
    {5, 869525000u, 250, 0x15, 7}, {6, 869525000u, 250, 0x16, 7},
    {7, 869525000u, 250, 0x17, 7}, {8, 869525000u, 250, 0x18, 7},
    {9, 869525000u, 250, 0x19, 7}, {10, 869525000u, 250, 0x1A, 7},
    {11, 869525000u, 250, 0x1B, 7}, {12, 869525000u, 250, 0x1C, 7},
    {13, 869525000u, 250, 0x1D, 7},
};

const kl_channel_plan_entry_t *kl_channel_plan_entry(uint8_t wifi_channel, uint8_t band) {
  if (wifi_channel < 1 || wifi_channel > KL_CHANNEL_COUNT) return NULL;
  (void)band;
  const kl_channel_plan_entry_t *plan = kPlan;
  return &plan[wifi_channel - 1];
}

uint8_t kl_channel_plan_band_for_freq(float freq_mhz) {
  (void)freq_mhz;
  return KL_BAND_868; /* 433 МГц не используется */
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
