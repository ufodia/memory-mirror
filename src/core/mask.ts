import type { Finding } from './types.ts';

const DOT = '•';
const dots = (n: number) => DOT.repeat(Math.max(3, Math.min(n, 8)));

/**
 * A privacy screen for values: enough shape to recognize the item, not enough
 * to read it over someone's shoulder or in a screen recording.
 */
export function mask(finding: Pick<Finding, 'type' | 'value' | 'category'>): string {
  const value = finding.value;
  switch (finding.type) {
    case 'email': {
      const [user, domain = ''] = value.split('@');
      const dot = domain.lastIndexOf('.');
      const host = dot > 0 ? domain.slice(0, dot) : domain;
      const tld = dot > 0 ? domain.slice(dot) : '';
      return `${user[0] ?? ''}${dots(user.length - 1)}@${host[0] ?? ''}${dots(host.length - 1)}${tld}`;
    }
    case 'payment-card':
    case 'phone':
    case 'us-ssn':
    case 'tr-national-id':
    case 'uk-nino':
    case 'passport':
    case 'drivers-license': {
      const compact = value.replace(/[\s-]/g, '');
      return `${dots(compact.length - 4)}${compact.slice(-4)}`;
    }
    case 'iban': {
      const compact = value.replace(/\s/g, '');
      return `${compact.slice(0, 4)} ${dots(8)} ${compact.slice(-4)}`;
    }
    default:
      if (finding.category === 'credentials') return `${value.slice(0, 4)}${dots(12)}`;
      if (
        finding.category === 'health' ||
        finding.category === 'sensitive' ||
        finding.category === 'financial'
      )
        return maskWords(value);
      if (value.length <= 3) return dots(value.length);
      return `${value[0]}${dots(value.length - 2)}${value[value.length - 1]}`;
  }
}

/** Keep short connecting words so the snippet still reads as a sentence. */
function maskWords(value: string): string {
  return value
    .split(/(\s+)/)
    .map((word) =>
      /^\s+$/.test(word) || /^(?:my|i|i'm|is|was|of|on|a|an|the|to|for|about|around|with)$/i.test(word)
        ? word
        : `${word[0]}${dots(word.length - 1)}`,
    )
    .join('');
}
