import { describe, expect, it } from 'vitest';
import { isIban, isPaymentCard, isPhone, isTurkishId, isUsSsn, luhn } from '../src/core/validators.ts';

describe('checksum validators', () => {
  it('accepts valid payment cards and rejects near misses', () => {
    expect(isPaymentCard('4242 4242 4242 4242')).toBe(true);
    expect(isPaymentCard('5555-5555-5555-4444')).toBe(true);
    expect(isPaymentCard('4242 4242 4242 4241')).toBe(false);
    expect(isPaymentCard('1111 1111 1111 1111')).toBe(false);
    expect(isPaymentCard('9242 4242 4242 4242')).toBe(false);
    expect(luhn('79927398713')).toBe(true);
  });

  it('validates IBANs with country length and MOD 97', () => {
    expect(isIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isIban('DE89370400440532013000')).toBe(true);
    expect(isIban('TR330006100519786457841326')).toBe(true);
    expect(isIban('GB82 WEST 1234 5698 7654 33')).toBe(false);
    expect(isIban('GB82WEST123456987654')).toBe(false);
    expect(isIban('XX82WEST12345698765432')).toBe(false);
  });

  it('validates Turkish national IDs', () => {
    expect(isTurkishId('10000000146')).toBe(true);
    expect(isTurkishId('10000000147')).toBe(false);
    expect(isTurkishId('01234567890')).toBe(false);
  });

  it('applies US SSN never-issued ranges', () => {
    expect(isUsSsn('123-45-6789')).toBe(true);
    expect(isUsSsn('000-12-3456')).toBe(false);
    expect(isUsSsn('666-12-3456')).toBe(false);
    expect(isUsSsn('912-12-3456')).toBe(false);
    expect(isUsSsn('123-00-6789')).toBe(false);
  });

  it('separates phone numbers from dates and addresses', () => {
    expect(isPhone('+1 (503) 555-0142')).toBe(true);
    expect(isPhone('+905321234567')).toBe(true);
    expect(isPhone('030 1234 5678')).toBe(true);
    expect(isPhone('2026-03-02')).toBe(false);
    expect(isPhone('192.168.100.200')).toBe(false);
    expect(isPhone('12345')).toBe(false);
  });
});
