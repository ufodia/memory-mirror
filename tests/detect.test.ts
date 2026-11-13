import { describe, expect, it } from 'vitest';
import { detect, firstPersonStrength } from '../src/core/detect.ts';
import type { Finding, Segment, SegmentKind } from '../src/core/types.ts';
import { DEFAULT_OPTIONS } from '../src/core/types.ts';

const segment = (text: string, role: Segment['role'] = 'user', kind: SegmentKind = 'message'): Segment => ({
  id: 'c:0',
  conversationId: 'c',
  role,
  kind,
  text,
});
const scan = (text: string, options = DEFAULT_OPTIONS, kind: SegmentKind = 'message') =>
  detect([segment(text, 'user', kind)], options);
const types = (findings: Finding[]) => findings.map((f) => f.type);
const values = (findings: Finding[]) => findings.map((f) => f.value);

describe('identifiers and secrets', () => {
  it('finds checksum-valid identifiers with exact spans', () => {
    const text = 'Card 4242 4242 4242 4242, IBAN GB82 WEST 1234 5698 7654 32 and SSN 123-45-6789.';
    const found = scan(text);
    expect(types(found)).toEqual(['payment-card', 'iban', 'us-ssn']);
    for (const f of found) expect(text.slice(f.start, f.end)).toBe(f.value);
  });

  it('trims a greedy IBAN that runs into an upper-case word', () => {
    const found = scan('Pay GB82WEST12345698765432 ASAP please');
    expect(values(found)).toEqual(['GB82WEST12345698765432']);
  });

  it('ignores invalid checksums', () => {
    expect(scan('Card 4242 4242 4242 4241 and ID 10000000147')).toEqual([]);
  });

  it('marks a Turkish ID as high confidence only with nearby context', () => {
    expect(scan('Numara 10000000146')[0].confidence).toBe('medium');
    expect(scan('TC kimlik no: 10000000146')[0].confidence).toBe('high');
  });

  it('finds API keys, connection strings and written passwords', () => {
    const found = scan(
      'key sk-proj-DEMOx9Qa7Lm2Rt5Vb8Nc1Zd4Hf6Jk3Pw0Ys db postgres://admin:hunter2@db.example:5432/app and my password is Tr0ub4dor&3',
    );
    expect(types(found)).toEqual(['openai-key', 'connection-string', 'password']);
    expect(found[2].value).toBe('Tr0ub4dor&3');
  });

  it('prefers a provider-specific key shape over the generic OpenAI pattern', () => {
    expect(types(scan('sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUV'))).toEqual(['ai-api-key']);
  });

  it('captures the full private-key payload, including encrypted and truncated blocks', () => {
    for (const label of ['PRIVATE KEY', 'RSA PRIVATE KEY', 'ENCRYPTED PRIVATE KEY']) {
      const key = `-----BEGIN ${label}-----\nSYNTHETIC-NOT-A-REAL-KEY-PAYLOAD\n-----END ${label}-----`;
      const found = scan(`Please inspect this key:\n${key}\nThank you.`);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ type: 'private-key', value: key });
    }
    const truncated = '-----BEGIN OPENSSH PRIVATE KEY-----\nSYNTHETIC-TRUNCATED-PAYLOAD';
    expect(scan(truncated)[0]).toMatchObject({ type: 'private-key', value: truncated });
  });
});

describe('contact, location and identity', () => {
  it('extracts contact details', () => {
    const found = scan('Reach me at jordan.avery@example.com or +1 (503) 555-0142.');
    expect(types(found)).toEqual(['email', 'phone']);
  });

  it('extracts where you live and your address', () => {
    expect(values(scan('I live in Portland, Oregon with two cats.'))).toEqual(['Portland, Oregon']);
    expect(values(scan("I'm moving to Berlin next spring."))).toEqual(['Berlin']);
    expect(values(scan('Send it to 2417 Alder Street, Apt 5 please.'))).toEqual(['2417 Alder Street, Apt 5']);
    expect(types(scan('Atatürk Mahallesi Çiçek Sok. No: 12/4 adresindeyim'))).toEqual(['tr-address']);
  });

  it('extracts name, age and birth date', () => {
    const found = scan("My name is Jordan Avery and I'm 34 years old. I was born on March 3, 1992.");
    expect(found.map((f) => [f.type, f.value])).toEqual([
      ['name', 'Jordan Avery'],
      ['age', '34'],
      ['birth-date', 'March 3, 1992'],
    ]);
  });
});

describe('context-sensitive categories', () => {
  it('requires a first-person sentence for health terms', () => {
    expect(scan('What is the difference between type 1 and type 2 diabetes?')).toEqual([]);
    expect(scan('Tell me about sertraline.')).toEqual([]);
    const found = scan("I've been on sertraline for anxiety and I still have insomnia.");
    expect(found.map((f) => [f.type, f.value, f.confidence])).toEqual([
      ['medication', 'sertraline', 'high'],
      ['mental-health', 'anxiety', 'high'],
      ['mental-health', 'insomnia', 'high'],
    ]);
  });

  it('scores a bare "I" lower than possession or experience', () => {
    expect(firstPersonStrength('I want to learn about diabetes')).toBe('medium');
    expect(firstPersonStrength('my doctor mentioned diabetes')).toBe('high');
    expect(firstPersonStrength('i.e. diabetes is common')).toBeNull();
    expect(firstPersonStrength('Tell me about diabetes')).toBeNull();
  });

  it('prefers the longest health term', () => {
    expect(values(scan('My doctor says I have type 2 diabetes.'))).toContain('type 2 diabetes');
  });

  it('detects special categories only in self-descriptions', () => {
    expect(types(scan("I'm a practicing Muslim and I voted for Jane Doe."))).toEqual([
      'religion',
      'politics',
    ]);
    expect(scan('Is it true that Muslim scholars wrote about algebra?')).toEqual([]);
    expect(scan('The bi-weekly meeting is at noon.')).toEqual([]);
    expect(types(scan('My visa expires in June and my lawyer says to renew early.'))).toEqual([
      'immigration',
      'legal',
    ]);
  });

  it('keeps organization names clean', () => {
    expect(values(scan('I work at Brightfield Labs and this is internal only.'))).toEqual([
      'Brightfield Labs',
      'internal only',
    ]);
    expect(values(scan('I work for Bank of America.'))).toEqual(['Bank of America']);
  });

  it('detects money matters', () => {
    const found = scan('My salary is $86,500 and I owe about $14,200 on my credit card debt.');
    expect(types(found)).toEqual(['income', 'debt']);
  });
});

describe('people', () => {
  it('captures names and relations without double counting', () => {
    const found = scan('My daughter Mila loves trains. My mom Linda visits on Sundays. My boss is strict.');
    expect(found.map((f) => [f.type, f.value, f.relation])).toEqual([
      ['named-person', 'Mila', 'daughter'],
      ['named-person', 'Linda', 'mom'],
      ['relation', 'boss', 'boss'],
    ]);
  });

  it('flags a child with an age', () => {
    const found = scan('My 7-year-old daughter has a school trip.');
    expect(found[0]).toMatchObject({ type: 'minor', relation: 'daughter' });
  });

  it('does not treat sentence words as names', () => {
    expect(types(scan('My boss Today said no.'))).toEqual(['relation']);
  });

  it('reads third-person saved memories as statements about you', () => {
    const found = scan(
      'Has a daughter named Mila who has a peanut allergy. Works at Brightfield Labs.',
      DEFAULT_OPTIONS,
      'memory',
    );
    expect(found.map((f) => [f.type, f.value])).toEqual([
      ['named-person', 'Mila'],
      ['condition', 'allergy'],
      ['employer', 'Brightfield Labs'],
    ]);
  });
});

describe('options', () => {
  it('skips assistant messages unless asked', () => {
    const segments = [segment('Your email is jordan@example.com', 'assistant')];
    expect(detect(segments, DEFAULT_OPTIONS)).toEqual([]);
    expect(detect(segments, { ...DEFAULT_OPTIONS, includeAssistant: true })).toHaveLength(1);
  });

  it('finds watch words as whole words', () => {
    const found = scan('Project Nightjar launches in May. Nightjars are birds.', {
      ...DEFAULT_OPTIONS,
      watchlist: ['Nightjar', ' '],
    });
    expect(found.map((f) => [f.category, f.value])).toEqual([['watchlist', 'Nightjar']]);
  });

  it('keeps a validated identifier when a short watch word overlaps it', () => {
    const found = scan('SSN 123-45-6789', { ...DEFAULT_OPTIONS, watchlist: ['123'] });
    expect(found.some((f) => f.type === 'watch-word' && f.value === '123')).toBe(true);
    expect(found.some((f) => f.type === 'us-ssn' && f.value === '123-45-6789')).toBe(true);
  });

  it('handles empty and hostile input without throwing', () => {
    expect(scan('')).toEqual([]);
    expect(() => scan('a'.repeat(200_000) + '@' + 'b'.repeat(50))).not.toThrow();
  });
});
