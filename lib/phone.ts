/** Saudi mobile format for SMS OTP; do not store or log raw OTP codes. */
export function normalizeSaudiMobile(raw: string): string | null {
  const v = raw.trim().replace(/[\s\-()]/g, "");
  const local = v.replace(/^\+966/, "0").replace(/^00966/, "0").replace(/^966/, "0");
  const normalized = local.startsWith("05") ? local : local.startsWith("5") ? "0" + local : local;
  return /^05\d{8}$/.test(normalized) ? "+966" + normalized.slice(1) : null;
}
