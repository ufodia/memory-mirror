import {
  CRISIS,
  HEALTH_CONDITIONS,
  IMMIGRATION,
  LEGAL,
  MEDICATIONS,
  MENTAL_HEALTH,
  NOT_A_NAME,
  ORIENTATION,
  POLITICS,
  RELATIONS,
  RELIGION,
  REPRODUCTIVE,
  SUBSTANCE,
} from './lexicon.ts';
import type { Category, Confidence, Finding, ScanOptions, Segment, SegmentKind } from './types.ts';
import {
  IBAN_LENGTHS,
  digitsOnly,
  isIban,
  isPaymentCard,
  isPhone,
  isTurkishId,
  isUsSsn,
} from './validators.ts';

interface Rule {
  category: Category;
  type: string;
  label: string;
  pattern: RegExp;
  /** Capture group that holds the value; the whole match when omitted. */
  group?: number;
  validate?: (value: string, match: RegExpExecArray, text: string) => boolean;
  /** Shorten a greedy match to the valid prefix, or return null to reject it. */
  refine?: (value: string) => string | null;
  confidence?: Confidence | ((value: string, match: RegExpExecArray, text: string) => Confidence);
  /** Only count the match inside a sentence written in the first person. */
  firstPerson?: boolean;
  /** Restrict the rule to these segment kinds, for example third-person saved memories. */
  kinds?: SegmentKind[];
  key?: (value: string, match: RegExpExecArray) => string;
  relation?: (match: RegExpExecArray) => string;
}

const escape = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]");
/** Unicode-aware whole-word alternation, longest terms first so "type 2 diabetes" beats "diabetes". */
const words = (terms: string[]) =>
  [...terms]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|');
const lexicon = (terms: string[], flags = 'giu') =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${words(terms)})(?![\\p{L}\\p{N}])`, flags);

const NAME = "\\p{Lu}[\\p{L}'’-]+";
const PLACE = `${NAME}(?:[ ,]+${NAME}){0,3}`;
/** An organization name; dots are allowed only inside it ("Amazon.com"), never as trailing punctuation. */
const ORG_WORD = "[\\p{Lu}\\d](?:[\\p{L}\\d&'’-]|\\.(?=[\\p{L}\\d]))*";
/** Connectors such as "of" only count between two capitalized words, never at the end. */
const ORG = `${ORG_WORD}(?:(?: (?:of|and|&|for))? ${ORG_WORD}){0,4}`;
const AMOUNT =
  '[$€£₺¥]\\s?\\d[\\d,.]*(?:\\s?[kKmM])?|\\d[\\d,.]*\\s?(?:k|K|USD|EUR|GBP|TRY|TL|dollars|euros|pounds)';

const near = (text: string, index: number, pattern: RegExp, radius = 40) =>
  pattern.test(text.slice(Math.max(0, index - radius), index + radius));

/** A greedy IBAN match can swallow a following upper-case word; cut it to the country's official length. */
function refineIban(value: string): string | null {
  const length = IBAN_LENGTHS[value.slice(0, 2).toUpperCase()];
  if (!length) return null;
  let count = 0;
  for (let i = 0; i < value.length; i++) {
    if (/[A-Za-z0-9]/.test(value[i])) count++;
    if (count === length) return value.slice(0, i + 1);
  }
  return null;
}

/** Detector rules in priority order: when two findings overlap, the earlier rule wins. */
// prettier-ignore
export const RULES: Rule[] = [
  // Credentials and secrets.
  { category: 'credentials', type: 'private-key', label: 'Private key block', pattern: /-----BEGIN ((?:(?:RSA|EC|OPENSSH|DSA|PGP|ENCRYPTED) )?PRIVATE KEY(?: BLOCK)?)-----[\s\S]*?(?:-----END \1-----|$)/g },
  { category: 'credentials', type: 'ai-api-key', label: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { category: 'credentials', type: 'openai-key', label: 'OpenAI API key', pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g },
  { category: 'credentials', type: 'github-token', label: 'GitHub token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g },
  { category: 'credentials', type: 'aws-key', label: 'AWS access key ID', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { category: 'credentials', type: 'slack-token', label: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },
  { category: 'credentials', type: 'google-key', label: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { category: 'credentials', type: 'stripe-key', label: 'Stripe secret key', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { category: 'credentials', type: 'jwt', label: 'JSON Web Token', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { category: 'credentials', type: 'connection-string', label: 'Database URL with password', pattern: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@[^\s'"<>]+/gi },
  { category: 'credentials', type: 'password', label: 'Password written in a message', pattern: /\b(?:my |the |our )?(?:password|passcode|pwd|PIN)\s*(?:is|was|=|:)\s*["'“]?([^\s"'”]{4,64})/gi, group: 1 },

  // Government and financial identifiers, all checksum-validated.
  { category: 'government-id', type: 'us-ssn', label: 'US Social Security number', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, validate: isUsSsn, key: digitsOnly },
  { category: 'government-id', type: 'tr-national-id', label: 'Turkish national ID (T.C. Kimlik No)', pattern: /\b[1-9]\d{10}\b/g, validate: isTurkishId, key: digitsOnly,
    confidence: (_v, m, text) => (near(text, m.index, /\b(?:T\.?C\.?|TCKN|kimlik|national id|identity)\b/i) ? 'high' : 'medium') },
  { category: 'government-id', type: 'uk-nino', label: 'UK National Insurance number', pattern: /\b(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z] ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/g, key: (v) => v.replace(/\s/g, '') },
  { category: 'government-id', type: 'passport', label: 'Passport number', pattern: /\bpassport(?: number| no\.?| #)?\s*(?:is|:|#)?\s*([A-Z0-9]{6,9})\b/gi, group: 1, validate: (v) => /\d/.test(v) },
  { category: 'government-id', type: 'drivers-license', label: "Driver's license number", pattern: /\bdriver'?s licen[cs]e(?: number| no\.?)?\s*(?:is|:)?\s*([A-Z0-9-]{5,15})\b/gi, group: 1, validate: (v) => /\d/.test(v) },
  { category: 'financial', type: 'iban', label: 'IBAN (bank account)', pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g, refine: refineIban, validate: isIban, key: (v) => v.replace(/\s/g, '').toUpperCase() },
  { category: 'financial', type: 'payment-card', label: 'Payment card number', pattern: /\b(?:\d[ -]?){12,18}\d\b/g, validate: isPaymentCard, key: digitsOnly },

  // Contact details.
  { category: 'contact', type: 'email', label: 'Email address', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi, key: (v) => v.toLowerCase() },
  { category: 'contact', type: 'phone', label: 'Phone number', pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,5}(?:[\s.-]\d{2,5}){1,4}\b|\+\d{9,15}\b/g, validate: isPhone, key: digitsOnly },

  // Location.
  { category: 'location', type: 'street-address', label: 'Street address', pattern: new RegExp(`\\b\\d{1,5}\\s+(?:${NAME}\\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Close|Crescent)\\b\\.?(?:,? (?:Apt|Unit|Suite|#) ?[\\w-]+)?`, 'gu') },
  { category: 'location', type: 'tr-address', label: 'Turkish street address', pattern: /(?<![\p{L}])\p{Lu}[\p{L}]+ (?:Mah(?:allesi)?\.?|Cad(?:desi)?\.?|Sok(?:ağı|ak)?\.?|Bulvarı)[^\n]{0,60}?No ?: ?\d+[A-Z]?(?:\/\d+)?/gu },
  { category: 'location', type: 'address-statement', label: 'Home address', pattern: /\bmy (?:home |street |mailing )?address is ([^\n.;]{6,80})/gi, group: 1 },
  { category: 'location', type: 'postal-code', label: 'Postal code', pattern: /\bmy (?:zip|zip code|postcode|postal code) is ([A-Z0-9][A-Z0-9 -]{2,8}[A-Z0-9])\b/gi, group: 1 },
  { category: 'location', type: 'coordinates', label: 'GPS coordinates', pattern: /(?<![\d.])-?\d{1,2}\.\d{4,},\s?-?\d{1,3}\.\d{4,}(?![\d.])/g },
  { category: 'location', type: 'residence', label: 'Where you live', pattern: new RegExp(`\\bI(?:'m| am)? (?:live|living|reside|residing|based|grew up|moved|moving|relocated|relocating) (?:in|to|near|out of) (${PLACE})`, 'gu'), group: 1 },
  { category: 'location', type: 'hometown', label: 'Hometown', pattern: new RegExp(`\\bmy (?:hometown|home town|neighbou?rhood) (?:is|was) (${PLACE})`, 'gu'), group: 1 },

  // Identity.
  { category: 'identity', type: 'name', label: 'Your name', pattern: new RegExp(`\\b(?:[Mm]y (?:full )?name is|[Cc]all me|[Ss]igned,?)\\s+(${NAME}(?: ${NAME}){0,2})`, 'gu'), group: 1, validate: (v) => !NOT_A_NAME.has(v.split(' ')[0]) },
  { category: 'identity', type: 'age', label: 'Your age', pattern: /\bI(?:'m| am) (\d{1,2}) (?:years old|yrs old|yo|y\/o)\b/gi, group: 1 },
  { category: 'identity', type: 'birth-date', label: 'Date of birth', pattern: /\b(?:I was born on|born on|date of birth(?: is)?|DOB:?|my birthday is)\s+((?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4})|(?:[A-Z][a-z]+ \d{1,2}(?:st|nd|rd|th)?,? \d{4})|(?:\d{1,2} [A-Z][a-z]+ \d{4}))/g, group: 1 },

  // Work.
  { category: 'work', type: 'employer', label: 'Employer', pattern: new RegExp(`\\bI(?:'m| am)? (?:work|working|employed|interning) (?:at|for) (${ORG})`, 'gu'), group: 1, validate: (v) => !NOT_A_NAME.has(v.split(' ')[0]) },
  { category: 'work', type: 'job', label: 'Job title and employer', pattern: new RegExp(`\\bI(?:'m| am) (?:a|an|the) ((?:senior |junior |lead |head |chief |staff |principal )?[a-z][a-z-]+(?: [a-z][a-z-]+){0,3}) (?:at|for) (${ORG})`, 'gu') },
  { category: 'work', type: 'confidential', label: 'Confidential work material', pattern: /\b(?:strictly confidential|confidential|internal only|internal use only|under (?:an |the )?NDA|not public yet|unreleased|trade secret|do not share|embargoed)\b/gi, confidence: 'medium' },

  // Saved memories and custom instructions describe you in the third person ("Works at …").
  { category: 'work', type: 'employer', label: 'Employer', kinds: ['memory', 'instructions'], pattern: new RegExp(`\\b(?:[Ww]orks|[Ii]s working|[Ii]s employed|[Ii]s an? [a-z ]{3,40}) (?:at|for) (${ORG})`, 'gu'), group: 1 },
  { category: 'location', type: 'residence', label: 'Where you live', kinds: ['memory', 'instructions'], pattern: new RegExp(`\\b(?:[Ll]ives|[Ii]s based|[Rr]esides|[Ii]s living|[Ii]s moving|[Mm]oved|[Ii]s relocating) (?:in|to|near) (${PLACE})`, 'gu'), group: 1 },

  // Health, first-person context only.
  { category: 'health', type: 'crisis', label: 'Crisis or self-harm', pattern: lexicon(CRISIS), firstPerson: true },
  { category: 'health', type: 'mental-health', label: 'Mental health', pattern: lexicon(MENTAL_HEALTH), firstPerson: true },
  { category: 'health', type: 'reproductive', label: 'Reproductive health', pattern: lexicon(REPRODUCTIVE), firstPerson: true },
  { category: 'health', type: 'substance', label: 'Substance use', pattern: lexicon(SUBSTANCE), firstPerson: true },
  { category: 'health', type: 'medication', label: 'Medication', pattern: lexicon(MEDICATIONS), firstPerson: true },
  { category: 'health', type: 'condition', label: 'Medical condition or treatment', pattern: lexicon(HEALTH_CONDITIONS), firstPerson: true },

  // Special categories of personal data (GDPR Article 9 and similar).
  { category: 'sensitive', type: 'religion', label: 'Religion or belief', pattern: new RegExp(`\\b(?:I(?:'m| am)|as an?|we(?:'re| are))\\s+(?:an? )?(?:proud |practicing |practising |devout |lapsed |former |non-practicing )?(${words(RELIGION)})(?![\\p{L}])`, 'giu'), group: 1 },
  { category: 'sensitive', type: 'politics', label: 'Political opinion', pattern: new RegExp(`\\b(?:I(?:'m| am)|as an?)\\s+(?:an? )?(?:proud |lifelong |registered |former )?(${words(POLITICS)})(?![\\p{L}])|\\bI voted (?:for )?(${NAME}(?: ${NAME}){0,2})`, 'gu') },
  { category: 'sensitive', type: 'orientation', label: 'Sexual orientation or gender identity', pattern: new RegExp(`\\b(?:I(?:'m| am)|as an?)\\s+(?:an? )?(?:openly |closeted |proud )?(${words(ORIENTATION)})(?:\\s(?:man|woman|person|guy|girl))?(?![\\p{L}-])|\\bI (?:came|am coming|'m coming) out\\b`, 'giu') },
  { category: 'sensitive', type: 'immigration', label: 'Immigration status', pattern: lexicon(IMMIGRATION), firstPerson: true },
  { category: 'sensitive', type: 'legal', label: 'Legal or criminal matter', pattern: lexicon(LEGAL), firstPerson: true },

  // Money, first-person context only.
  { category: 'financial', type: 'income', label: 'Income or salary', pattern: new RegExp(`\\b(?:my (?:salary|income|pay|paycheck|take-home|hourly rate|bonus) (?:is|was|of)? ?(?:about |around |roughly )?(?:${AMOUNT})|I (?:make|earn|made|earned|get paid) (?:about |around |roughly )?(?:${AMOUNT}))`, 'giu') },
  { category: 'financial', type: 'debt', label: 'Debt or arrears', pattern: /\b(?:I owe|my (?:debt|loan|loans|student loans?|mortgage|credit card debt|car payment)|behind on (?:my )?(?:rent|payments|mortgage|bills)|(?:filing for |filed for |declared )?bankruptcy|in collections|overdrawn|my overdraft)\b[^.\n]{0,40}/gi },
  { category: 'financial', type: 'financial-detail', label: 'Savings, credit or tax detail', pattern: new RegExp(`\\bmy (?:savings|net worth|credit score|401\\(?k\\)?|pension|IRA|tax return|tax refund|inheritance|rent|budget|bank balance)\\b(?: (?:is|was|of) (?:about |around )?(?:${AMOUNT}|\\d{3}))?`, 'giu'), confidence: 'medium' },

  // People you mention.
  { category: 'people', type: 'minor', label: 'Child and age', pattern: /\bmy (\d{1,2})[- ](?:year|yr)[- ]old (son|daughter|kid|child|boy|girl|baby|twins)\b/gi, relation: (m) => m[2].toLowerCase() },
  { category: 'people', type: 'named-person', label: 'Named person in your life', pattern: new RegExp(`\\b[Mm]y (${words(RELATIONS)}),? (?:named |called )?(${NAME})`, 'gu'), group: 2,
    validate: (v) => !NOT_A_NAME.has(v), relation: (m) => m[1].toLowerCase(), key: (v, m) => `${m[1].toLowerCase()}:${v.toLowerCase()}` },
  { category: 'people', type: 'relation', label: 'Person in your life', pattern: new RegExp(`\\b[Mm]y (${words(RELATIONS)})(?![\\p{L}])`, 'gu'), group: 1, confidence: 'medium', relation: (m) => m[1].toLowerCase(), key: (v) => v.toLowerCase() },
  { category: 'people', type: 'named-person', label: 'Named person in your life', kinds: ['memory', 'instructions'], pattern: new RegExp(`\\b(?:has|have|with) (?:a |an |one |two |three )?(${words(RELATIONS)}),? (?:named |called )(${NAME})`, 'giu'), group: 2,
    validate: (v) => !NOT_A_NAME.has(v), relation: (m) => m[1].toLowerCase(), key: (v, m) => `${m[1].toLowerCase()}:${v.toLowerCase()}` },
];

/** Any first-person sentence. "me" alone is excluded: "tell me about diabetes" is a question, not a disclosure. */
const FIRST_PERSON =
  /(?<![\p{L}.])(?:i|i['’]m|i['’]ve|i['’]d|i['’]ll)(?![\p{L}.])|(?<![\p{L}])(?:my|myself)(?![\p{L}])/iu;
/** Possession or lived experience: "my", "I have", "I was diagnosed", "I'm on". */
const FIRST_PERSON_STRONG =
  /(?<![\p{L}])(?:my|myself)(?![\p{L}])|(?<![\p{L}.])i(?:['’]ve| have| had| was| got| take| took| am on|['’]m on| am taking|['’]m taking| suffer| struggle| live with| started| stopped| quit| used to| relapsed| went)(?![\p{L}])|(?<![\p{L}.])i(?:['’]m| am) (?:pregnant|depressed|anxious|bipolar|autistic|sober|diabetic|addicted|suicidal|in (?:therapy|rehab|recovery))/iu;

/** The sentence around a match, bounded by sentence punctuation or newlines. */
export function sentenceAround(text: string, start: number, end: number): string {
  let from = start;
  while (from > 0 && !/[.!?\n]/.test(text[from - 1])) from--;
  let to = end;
  while (to < text.length && !/[.!?\n]/.test(text[to])) to++;
  return text.slice(from, to);
}

/** `null` when the sentence is not about the writer, otherwise how strongly it is. */
export function firstPersonStrength(sentence: string): Confidence | null {
  if (FIRST_PERSON_STRONG.test(sentence)) return 'high';
  return FIRST_PERSON.test(sentence) ? 'medium' : null;
}

function watchlistRules(terms: string[]): Rule[] {
  const cleaned = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))].slice(0, 200);
  if (!cleaned.length) return [];
  return [
    {
      category: 'watchlist',
      type: 'watch-word',
      label: 'Watch word',
      pattern: lexicon(cleaned),
      key: (v) => v.toLowerCase(),
    },
  ];
}

/** Run every detector on the segments the options select. */
export function detect(
  segments: Segment[],
  options: ScanOptions,
  onProgress?: (done: number, total: number) => void,
): Finding[] {
  const rules = [...watchlistRules(options.watchlist), ...RULES];
  const rank = new Map<Finding, number>();
  const findings: Finding[] = [];
  let counter = 0;
  for (const [index, segment] of segments.entries()) {
    if (onProgress && index % 2000 === 0) onProgress(index, segments.length);
    if (segment.role !== 'user' && !(options.includeAssistant && segment.role === 'assistant')) continue;
    const text = segment.text;
    if (!text) continue;
    const local: Finding[] = [];
    // Memories and custom instructions are about you by definition.
    const aboutUser = segment.kind === 'memory' || segment.kind === 'instructions';
    for (const [ruleIndex, rule] of rules.entries()) {
      if (rule.kinds && !rule.kinds.includes(segment.kind)) continue;
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(text))) {
        if (match[0].length === 0) {
          rule.pattern.lastIndex++;
          continue;
        }
        const groupIndex = rule.group && match[rule.group] !== undefined ? rule.group : undefined;
        const raw = groupIndex ? match[groupIndex] : match[0];
        // Locate the group inside the match from the right so a repeated word earlier in the match is not picked.
        const base = groupIndex ? match.index + match[0].lastIndexOf(raw) : match.index;
        let value = raw.trim();
        if (rule.refine) {
          const refined = rule.refine(value);
          if (!refined) continue;
          value = refined;
        }
        if (!value) continue;
        const start = base + raw.indexOf(value);
        const end = start + value.length;
        if (rule.validate && !rule.validate(value, match, text)) continue;
        let confidence: Confidence =
          typeof rule.confidence === 'function'
            ? rule.confidence(value, match, text)
            : (rule.confidence ?? 'high');
        if (rule.firstPerson && !aboutUser) {
          const strength = firstPersonStrength(sentenceAround(text, start, end));
          if (!strength) continue;
          if (strength === 'medium') confidence = 'medium';
        }
        const finding: Finding = {
          id: `f${++counter}`,
          category: rule.category,
          type: rule.type,
          label: rule.label,
          value,
          key: rule.key ? rule.key(value, match) : value.toLowerCase().replace(/\s+/g, ' '),
          start,
          end,
          segmentId: segment.id,
          conversationId: segment.conversationId,
          role: segment.role,
          kind: segment.kind,
          confidence,
          time: segment.time,
          relation: rule.relation?.(match),
        };
        rank.set(finding, ruleIndex);
        local.push(finding);
      }
    }
    findings.push(...resolveOverlaps(local, (f) => rank.get(f) ?? 999));
  }
  return findings;
}

/** Built-in overlaps follow detector priority. Watch words remain independent review annotations. */
export function resolveOverlaps(findings: Finding[], rank: (f: Finding) => number): Finding[] {
  const sorted = [...findings].sort((a, b) => rank(a) - rank(b) || b.end - b.start - (a.end - a.start));
  const kept: Finding[] = [];
  for (const finding of sorted) {
    // A named person ("my daughter Mila") and the bare relation ("my daughter") describe the same mention.
    const clash = kept.some((other) => {
      // A short watch word must never suppress a longer credential or identifier.
      if (finding.category === 'watchlist' || other.category === 'watchlist') return false;
      const overlaps = finding.start < other.end && other.start < finding.end;
      const sameMention =
        finding.type === 'relation' &&
        (other.type === 'named-person' || other.type === 'minor') &&
        Math.abs(other.start - finding.end) <= 3;
      return overlaps || sameMention;
    });
    if (!clash) kept.push(finding);
  }
  return kept.sort((a, b) => a.start - b.start);
}
