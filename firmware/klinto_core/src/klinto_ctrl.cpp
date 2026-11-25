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

bool load_or_create_key(mbedtls_mpi &d) {
  char hex[65] = {0};
  mbedtls_mpi_init(&d);
  if (kl_nvs_get_str(kNs, kKey, hex, sizeof(hex)) && strlen(hex) == 64 &&
      mbedtls_mpi_read_string(&d, 16, hex) == 0) {
    return true;
  }
  mbedtls_ecp_group grp;
  mbedtls_ecp_group_init(&grp);
  bool ok = false;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    if (mbedtls_ecp_gen_privkey(&grp, &d, rng_cb, nullptr) != 0) break;
    char out[65] = {0};
    if (mbedtls_mpi_write_string(&d, 16, out, sizeof(out), nullptr) != 0) break;
    kl_nvs_set_str(kNs, kKey, out);
    ok = true;
  } while (false);
  mbedtls_ecp_group_free(&grp);
  if (!ok) mbedtls_mpi_free(&d);
  return ok;
}

bool pubkey_compressed(const mbedtls_mpi &d, uint8_t out[kPubLen]) {
  mbedtls_ecp_group grp;
  mbedtls_ecp_point q;
  mbedtls_ecp_group_init(&grp);
  mbedtls_ecp_point_init(&q);
  bool ok = false;
  size_t len = 0;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    if (mbedtls_ecp_mul(&grp, &q, &d, &grp.G, rng_cb, nullptr) != 0) break;
    if (mbedtls_ecp_point_write_binary(&grp, &q, MBEDTLS_ECP_PF_COMPRESSED,
                                       &len, out, kPubLen) != 0) break;
    ok = len == kPubLen;
  } while (false);
  mbedtls_ecp_point_free(&q);
  mbedtls_ecp_group_free(&grp);
  return ok;
}

bool sign_digest(void *, const uint8_t digest[32], uint8_t *sig, size_t *sig_len) {
  mbedtls_mpi d;
  if (!load_or_create_key(d)) return false;
  mbedtls_ecp_group grp;
  mbedtls_ecp_group_init(&grp);
  bool ok = false;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    mbedtls_mpi r, s;
    mbedtls_mpi_init(&r);
    mbedtls_mpi_init(&s);
    if (mbedtls_ecdsa_sign(&grp, &r, &s, &d, digest, 32, rng_cb, nullptr) == 0 &&
        *sig_len >= 2 * kSigHalf) {
      mbedtls_mpi_write_binary(&r, sig, kSigHalf);
      mbedtls_mpi_write_binary(&s, sig + kSigHalf, kSigHalf);
      *sig_len = 2 * kSigHalf;
      ok = true;
    }
    mbedtls_mpi_free(&r);
    mbedtls_mpi_free(&s);
  } while (false);
  mbedtls_ecp_group_free(&grp);
  mbedtls_mpi_free(&d);
  return ok;
}

}  // namespace

bool kl_ctrl_pubkey(uint8_t out[33]) {
  mbedtls_mpi d;
  if (!load_or_create_key(d)) return false;
  return pubkey_compressed(d, out);
}

bool kl_ctrl_descriptor(const uint8_t digest[32], uint8_t out[97], size_t *out_len) {
  if (!out || !out_len || *out_len < kDescLen) return false;
  if (!kl_ctrl_pubkey(out)) return false;
  size_t slen = 2 * kSigHalf;
  if (!sign_digest(nullptr, digest, out + kPubLen, &slen) || slen != 2 * kSigHalf) return false;
  *out_len = kDescLen;
  return true;
}

bool kl_ctrl_verify_descriptor(const uint8_t digest[32], const uint8_t *desc, size_t desc_len) {
  if (!desc || desc_len < kDescLen) return false;
  mbedtls_ecp_group grp;
  mbedtls_ecp_point q;
  mbedtls_ecdsa_context ctx;
  mbedtls_ecp_group_init(&grp);
  mbedtls_ecp_point_init(&q);
  mbedtls_ecdsa_init(&ctx);
  bool ok = false;
  do {
    if (mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1) != 0) break;
    if (mbedtls_ecp_point_read_binary(&grp, &q, desc, kPubLen) != 0) break;
    if (mbedtls_ecp_copy(&ctx.grp, &grp) != 0) break;
    if (mbedtls_ecp_copy(&ctx.Q, &q) != 0) break;
    mbedtls_mpi r, s;
    mbedtls_mpi_init(&r);
    mbedtls_mpi_init(&s);
    mbedtls_mpi_read_binary(&r, desc + kPubLen, kSigHalf);
    mbedtls_mpi_read_binary(&s, desc + kPubLen + kSigHalf, kSigHalf);
    ok = mbedtls_ecdsa_verify(&ctx, digest, 32, &r, &s) == 0;
    mbedtls_mpi_free(&r);
    mbedtls_mpi_free(&s);
  } while (false);
  mbedtls_ecdsa_free(&ctx);
  mbedtls_ecp_point_free(&q);
  mbedtls_ecp_group_free(&grp);
  return ok;
}

void kl_ctrl_signer_init() {
  // Подпись управления идёт через kl_ctrl_descriptor(); встроенный
  // signer/verifier для permanent-подписи пользователя не трогаем.
}

#else  // !ESP_PLATFORM

void kl_ctrl_signer_init() {}
bool kl_ctrl_pubkey(uint8_t *) { return false; }
bool kl_ctrl_descriptor(const uint8_t *, uint8_t *, size_t *) { return false; }
bool kl_ctrl_verify_descriptor(const uint8_t *, const uint8_t *, size_t) { return false; }

#endif  // ESP_PLATFORM
