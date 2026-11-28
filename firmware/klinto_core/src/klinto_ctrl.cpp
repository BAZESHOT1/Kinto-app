/**
 * kMesh v2 — подпись управляющих пакетов.
 *
 * ESP32: ECDSA P-256. Приватный ключ генерируется один раз и хранится в NVS
 * (`klinto3/km2_priv`), в открытом репозитории и в прошивке его нет. В пакет
 * кладётся self-contained дескриптор [compressed pubkey 33][sig r||s 64],
 * поэтому ретранслятор проверяет подпись, не имея базы ключей.
 * Хост: no-op (тесты портативного ядра подпись не используют).
 *
 * Идентификация модуля (MAC, BLE-имя, владелец) не меняется.
 */
#include "klinto_crypto.h"
#include "klinto_util.h"

#if defined(ESP_PLATFORM)

#include "klinto_platform_esp32.h"

#include <mbedtls/ecdsa.h>
#include <mbedtls/ecp.h>

#include <string.h>

#include <mutex>

namespace {

constexpr char kNs[] = "klinto3";
constexpr char kKey[] = "km2_priv";
constexpr size_t kSigHalf = 32;      // P-256 r/s
constexpr size_t kPubLen = 33;       // сжатая точка
constexpr size_t kDescLen = kPubLen + 2 * kSigHalf;

int rng_cb(void *, unsigned char *out, size_t len) {
  kl_random_bytes(out, len);
  return 0;  // mbedTLS: 0 = success
}

/* Приватный ключ и публичная точка создаются ОДИН раз и кэшируются: раньше каждый пакет
 * заново читал NVS, умножал точку (самая дорогая операция) и терял mpi без free. */
std::mutex g_mtx;
bool g_have_key = false;
bool g_have_pub = false;
mbedtls_mpi g_d;
uint8_t g_pub[kPubLen];

const char kHex[] = "0123456789abcdef";

int hex_nibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

/* Ключ — ровно 32 байта (64 hex): ведущие нули не теряются, формат фиксирован. */
bool decode_key(const char *hex, uint8_t raw[32]) {
  if (strlen(hex) != 64) return false;
  for (int i = 0; i < 32; ++i) {
    const int hi = hex_nibble(hex[2 * i]);
    const int lo = hex_nibble(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return false;
    raw[i] = (uint8_t)((hi << 4) | lo);
  }
  return true;
}

/* d должен лежать в [1, n-1], иначе ключ считаем повреждённым. */
bool key_in_range(const mbedtls_mpi &d) {
  mbedtls_ecp_group grp;
  mbedtls_ecp_group_init(&grp);
  bool ok = mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) == 0 &&
            mbedtls_mpi_cmp_int(&d, 0) > 0 && mbedtls_mpi_cmp_mpi(&d, &grp.N) < 0;
  mbedtls_ecp_group_free(&grp);
  return ok;
}

/* Вызывать под g_mtx. */
bool ensure_key_locked() {
  if (g_have_key) return true;
  mbedtls_mpi_init(&g_d);
  char hex[65] = {0};
  uint8_t raw[32];
  if (kl_nvs_get_str(kNs, kKey, hex, sizeof(hex)) && decode_key(hex, raw) &&
      mbedtls_mpi_read_binary(&g_d, raw, sizeof(raw)) == 0 && key_in_range(g_d)) {
    g_have_key = true;
    return true;
  }
  /* Ключа нет (или он испорчен) — создаём новый и сохраняем. */
  mbedtls_ecp_group grp;
  mbedtls_ecp_group_init(&grp);
  bool ok = false;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    if (mbedtls_ecp_gen_privkey(&grp, &g_d, rng_cb, nullptr) != 0) break;
    if (mbedtls_mpi_write_binary(&g_d, raw, sizeof(raw)) != 0) break;
    char out[65];
    for (int i = 0; i < 32; ++i) {
      out[2 * i] = kHex[raw[i] >> 4];
      out[2 * i + 1] = kHex[raw[i] & 0x0F];
    }
    out[64] = 0;
    kl_nvs_set_str(kNs, kKey, out);
    ok = true;
  } while (false);
  mbedtls_ecp_group_free(&grp);
  if (!ok) {
    mbedtls_mpi_free(&g_d);
    return false;
  }
  g_have_key = true;
  return true;
}

/* Вызывать под g_mtx. */
bool ensure_pub_locked() {
  if (g_have_pub) return true;
  if (!ensure_key_locked()) return false;
  mbedtls_ecp_group grp;
  mbedtls_ecp_point q;
  mbedtls_ecp_group_init(&grp);
  mbedtls_ecp_point_init(&q);
  bool ok = false;
  size_t len = 0;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    if (mbedtls_ecp_mul(&grp, &q, &g_d, &grp.G, rng_cb, nullptr) != 0) break;
    if (mbedtls_ecp_point_write_binary(&grp, &q, MBEDTLS_ECP_PF_COMPRESSED, &len, g_pub,
                                       kPubLen) != 0) break;
    ok = len == kPubLen;
  } while (false);
  mbedtls_ecp_point_free(&q);
  mbedtls_ecp_group_free(&grp);
  g_have_pub = ok;
  return ok;
}

bool sign_digest(const uint8_t digest[32], uint8_t *sig, size_t *sig_len) {
  {
    std::lock_guard<std::mutex> lock(g_mtx);
    if (!ensure_key_locked()) return false;
  }
  mbedtls_ecp_group grp;
  mbedtls_ecp_group_init(&grp);
  mbedtls_mpi r, s;
  mbedtls_mpi_init(&r);
  mbedtls_mpi_init(&s);
  bool ok = false;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    if (*sig_len < 2 * kSigHalf) break;
    if (mbedtls_ecdsa_sign(&grp, &r, &s, &g_d, digest, 32, rng_cb, nullptr) != 0) break;
    if (mbedtls_mpi_write_binary(&r, sig, kSigHalf) != 0) break;
    if (mbedtls_mpi_write_binary(&s, sig + kSigHalf, kSigHalf) != 0) break;
    *sig_len = 2 * kSigHalf;
    ok = true;
  } while (false);
  mbedtls_mpi_free(&r);
  mbedtls_mpi_free(&s);
  mbedtls_ecp_group_free(&grp);
  return ok;
}

}  // namespace

bool kl_ctrl_pubkey(uint8_t out[33]) {
  std::lock_guard<std::mutex> lock(g_mtx);
  if (!ensure_pub_locked()) return false;
  memcpy(out, g_pub, kPubLen);
  return true;
}

bool kl_ctrl_descriptor(const uint8_t digest[32], uint8_t out[97], size_t *out_len) {
  if (!out || !out_len || *out_len < kDescLen) return false;
  if (!kl_ctrl_pubkey(out)) return false;
  size_t slen = 2 * kSigHalf;
  if (!sign_digest(digest, out + kPubLen, &slen) || slen != 2 * kSigHalf) return false;
  *out_len = kDescLen;
  return true;
}

bool kl_ctrl_verify_descriptor(const uint8_t digest[32], const uint8_t *desc, size_t desc_len) {
  if (!desc || desc_len < kDescLen) return false;
  mbedtls_ecp_group grp;
  mbedtls_ecp_point q;
  mbedtls_ecp_group_init(&grp);
  mbedtls_ecp_point_init(&q);
  bool ok = false;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    if (mbedtls_ecp_point_read_binary(&grp, &q, desc, kPubLen) != 0) break;
    mbedtls_mpi r, s;
    mbedtls_mpi_init(&r);
    mbedtls_mpi_init(&s);
    mbedtls_mpi_read_binary(&r, desc + kPubLen, kSigHalf);
    mbedtls_mpi_read_binary(&s, desc + kPubLen + kSigHalf, kSigHalf);
    ok = mbedtls_ecdsa_verify(&grp, digest, 32, &q, &r, &s) == 0;
    mbedtls_mpi_free(&r);
    mbedtls_mpi_free(&s);
  } while (false);
  mbedtls_ecp_point_free(&q);
  mbedtls_ecp_group_free(&grp);
  return ok;
}

void kl_ctrl_signer_init() {
  /* Создаём/загружаем ключ и считаем публичную точку заранее (в setup, до mesh-задачи),
   * чтобы первая подпись в эфире не задерживала маяки. */
  uint8_t pub[kPubLen];
  (void)kl_ctrl_pubkey(pub);
}

#else  // !ESP_PLATFORM

void kl_ctrl_signer_init() {}
bool kl_ctrl_pubkey(uint8_t *) { return false; }
bool kl_ctrl_descriptor(const uint8_t *, uint8_t *, size_t *) { return false; }
bool kl_ctrl_verify_descriptor(const uint8_t *, const uint8_t *, size_t) { return false; }

#endif  // ESP_PLATFORM
