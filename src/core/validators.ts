/**
 * Checksum validators. They turn "looks like a number" into "is a structurally
 * valid identifier", which keeps the report free of most random digit runs.
 */

export const digitsOnly = (value: string): string => value.replace(/\D/g, '');

/** Luhn checksum used by payment cards. */
export function luhn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 2) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** A payment card number: 13–19 digits, a known network prefix and a valid Luhn checksum. */
export function isPaymentCard(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 13 || digits.length > 19) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  if (!/^(4|5[1-5]|2[2-7]|3[47]|6(?:011|5|4[4-9])|35)/.test(digits)) return false;
  return luhn(digits);
}

/** Official IBAN lengths by country (ISO 13616 registry). */
// prettier-ignore
export const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21,
  CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27,
  GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27,
  MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25,
  QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** ISO 7064 MOD 97-10 check used by IBANs. */
export function isIban(value: string): boolean {
  const compact = value.replace(/\s+/g, '').toUpperCase();
  const country = compact.slice(0, 2);
  const length = IBAN_LENGTHS[country];
  if (!length || compact.length !== length || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    const chunk = code >= 65 ? String(code - 55) : char;
    for (const digit of chunk) remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
  }
  return remainder === 1;
}

/** Turkish national identity number (T.C. Kimlik No) checksum. */
export function isTurkishId(value: string): boolean {
  const digits = digitsOnly(value);
  if (!/^[1-9]\d{10}$/.test(digits)) return false;
  const d = [...digits].map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (tenth !== d[9]) return false;
  const sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return sum % 10 === d[10];
}

/** US Social Security Number structural rules (never-issued ranges are rejected). */
export function isUsSsn(value: string): boolean {
  const match = /^(\d{3})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return false;
  const [, area, group, serial] = match;
  if (area === '000' || area === '666' || area[0] === '9') return false;
  return group !== '00' && serial !== '0000';
}

/** Phone numbers: 9 to 15 digits, written like a phone number rather than a date or an amount. */
export function isPhone(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 9 || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  const trimmed = value.trim();
  if (/^\d{4}[-/.]\d{2}[-/.]\d{2}$/.test(trimmed) || /^\d{2}[-/.]\d{2}[-/.]\d{4}$/.test(trimmed))
    return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(trimmed)) return false; // IPv4 address
  const separators = (trimmed.match(/[\s.()-]/g) ?? []).length;
  return trimmed.startsWith('+') || trimmed.startsWith('(') || separators >= 2;
}
