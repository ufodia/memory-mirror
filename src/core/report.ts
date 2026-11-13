import { detect } from './detect.ts';
import { mask } from './mask.ts';
import type { Archive, Category, Finding, Platform, ScanOptions } from './types.ts';

export interface CategoryMeta {
  label: string;
  description: string;
  /** How much one unique item in this category contributes to the exposure score. */
  weight: number;
}

export const CATEGORIES: Record<Category, CategoryMeta> = {
  credentials: {
    label: 'Secrets & credentials',
    description: 'API keys, tokens, passwords and private keys you pasted into a chat.',
    weight: 10,
  },
  'government-id': {
    label: 'Government IDs',
    description: 'National ID, social security, passport and licence numbers.',
    weight: 9,
  },
  health: {
    label: 'Health',
    description: 'Conditions, medication, mental health, reproductive health and treatment you described.',
    weight: 8,
  },
  sensitive: {
    label: 'Special categories',
    description: 'Religion, politics, sexuality, immigration and legal matters.',
    weight: 8,
  },
  financial: {
    label: 'Money',
    description: 'Bank accounts, cards, income, debt and other financial details.',
    weight: 7,
  },
  watchlist: {
    label: 'Your watch words',
    description: 'Exact words you asked Memory Mirror to look for.',
    weight: 6,
  },
  location: {
    label: 'Location',
    description: 'Where you live, addresses, postal codes and coordinates.',
    weight: 5,
  },
  people: {
    label: 'Other people',
    description: 'Family, friends and colleagues you talked about — people who never chose to share.',
    weight: 4,
  },
  contact: { label: 'Contact details', description: 'Email addresses and phone numbers.', weight: 4 },
  work: { label: 'Work', description: 'Employer, job title and material marked confidential.', weight: 4 },
  identity: { label: 'Identity', description: 'Your name, age and date of birth.', weight: 3 },
};

export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[];

export interface FindingView extends Finding {
  masked: string;
  before: string;
  after: string;
  conversationTitle: string;
}

export interface ItemSummary {
  key: string;
  type: string;
  label: string;
  masked: string;
  value: string;
  count: number;
  conversations: number;
  confidence: 'high' | 'medium';
  example: string;
}

export interface CategorySummary {
  category: Category;
  label: string;
  description: string;
  findings: number;
  unique: number;
  conversations: number;
  points: number;
  items: ItemSummary[];
}

export interface PersonSummary {
  relation: string;
  names: string[];
  mentions: number;
  conversations: number;
  minor: boolean;
}

export interface ConversationRisk {
  id: string;
  title: string;
  platform: Platform;
  url?: string;
  created?: number;
  points: number;
  findings: number;
  categories: Category[];
}

export interface Report {
  generatedAt: string;
  options: ScanOptions;
  stats: {
    conversations: number;
    scannedSegments: number;
    userMessages: number;
    words: number;
    first?: number;
    last?: number;
    platforms: Partial<Record<Platform, number>>;
    sources: string[];
    warnings: string[];
  };
  score: { value: number; level: 'Low' | 'Moderate' | 'High' | 'Very high'; total: number };
  categories: CategorySummary[];
  findings: FindingView[];
  people: PersonSummary[];
  conversations: ConversationRisk[];
  timeline: { month: string; count: number }[];
}

/** Score saturation constant: a total of 40 points maps to 63/100. */
const SCALE = 40;

export function scoreLevel(value: number): Report['score']['level'] {
  if (value >= 75) return 'Very high';
  if (value >= 50) return 'High';
  if (value >= 25) return 'Moderate';
  return 'Low';
}

/** Category points grow with the logarithm of unique items: the first disclosure matters most. */
export function categoryPoints(category: Category, unique: number): number {
  return CATEGORIES[category].weight * Math.log2(1 + unique);
}

export function exposureScore(total: number): number {
  return Math.round(100 * (1 - Math.exp(-total / SCALE)));
}

const CONTEXT = 72;
function context(text: string, start: number, end: number): { before: string; after: string } {
  let from = Math.max(0, start - CONTEXT);
  let to = Math.min(text.length, end + CONTEXT);
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  if (to < text.length) to = text.lastIndexOf(' ', to) > end ? text.lastIndexOf(' ', to) : to;
  const flat = (s: string) => s.replace(/\s+/g, ' ');
  return {
    before: (from > 0 ? '… ' : '') + flat(text.slice(from, start)),
    after: flat(text.slice(end, to)) + (to < text.length ? ' …' : ''),
  };
}

export function buildReport(
  archive: Archive,
  options: ScanOptions,
  { now = new Date(), onProgress }: { now?: Date; onProgress?: (done: number, total: number) => void } = {},
): Report {
  const segments = archive.conversations.flatMap((c) => c.segments);
  const textById = new Map(segments.map((s) => [s.id, s.text]));
  const titleById = new Map(archive.conversations.map((c) => [c.id, c.title]));
  const raw = detect(segments, options, onProgress);

  const findings: FindingView[] = raw.map((f) => ({
    ...f,
    masked: mask(f),
    conversationTitle: titleById.get(f.conversationId) ?? 'Conversation',
    ...context(textById.get(f.segmentId) ?? '', f.start, f.end),
  }));

  // Categories and unique items.
  const categories: CategorySummary[] = [];
  let total = 0;
  for (const category of Object.keys(CATEGORIES) as Category[]) {
    const inCategory = findings.filter((f) => f.category === category);
    if (!inCategory.length) continue;
    const items = new Map<string, ItemSummary & { convs: Set<string> }>();
    for (const f of inCategory) {
      const id = `${f.type}|${f.key}`;
      const item = items.get(id) ?? {
        key: f.key,
        type: f.type,
        label: f.label,
        masked: f.masked,
        value: f.value,
        count: 0,
        conversations: 0,
        confidence: f.confidence,
        example: f.id,
        convs: new Set<string>(),
      };
      item.count++;
      item.convs.add(f.conversationId);
      if (f.confidence === 'high') item.confidence = 'high';
      items.set(id, item);
    }
    const list = [...items.values()]
      .map(({ convs, ...item }) => ({ ...item, conversations: convs.size }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const points = categoryPoints(category, list.length);
    total += points;
    categories.push({
      category,
      ...CATEGORIES[category],
      findings: inCategory.length,
      unique: list.length,
      conversations: new Set(inCategory.map((f) => f.conversationId)).size,
      points,
      items: list,
    });
  }
  categories.sort((a, b) => b.points - a.points);

  // People.
  const people = new Map<
    string,
    { names: Set<string>; mentions: number; convs: Set<string>; minor: boolean }
  >();
  for (const f of findings.filter((x) => x.category === 'people')) {
    const relation = normalizeRelation(f.relation ?? f.value);
    const entry = people.get(relation) ?? { names: new Set(), mentions: 0, convs: new Set(), minor: false };
    entry.mentions++;
    entry.convs.add(f.conversationId);
    if (f.type === 'named-person') entry.names.add(f.value);
    if (f.type === 'minor') entry.minor = true;
    people.set(relation, entry);
  }

  // Conversations ranked by what they reveal.
  const byConversation = new Map<string, FindingView[]>();
  for (const f of findings) {
    const list = byConversation.get(f.conversationId);
    if (list) list.push(f);
    else byConversation.set(f.conversationId, [f]);
  }
  const conversations: ConversationRisk[] = archive.conversations
    .map((c) => {
      const own = byConversation.get(c.id) ?? [];
      const cats = [...new Set(own.map((f) => f.category))];
      const points = cats.reduce(
        (sum, cat) =>
          sum + categoryPoints(cat, new Set(own.filter((f) => f.category === cat).map((f) => f.key)).size),
        0,
      );
      return {
        id: c.id,
        title: c.title,
        platform: c.platform,
        url: c.url,
        created: c.created,
        points,
        findings: own.length,
        categories: cats,
      };
    })
    .filter((c) => c.findings > 0)
    .sort((a, b) => b.points - a.points || b.findings - a.findings);

  // Timeline by month of the message.
  const months = new Map<string, number>();
  for (const f of findings) {
    if (!f.time) continue;
    const month = new Date(f.time).toISOString().slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + 1);
  }

  let first: number | undefined;
  let last: number | undefined;
  for (const s of segments) {
    if (typeof s.time !== 'number') continue;
    if (first === undefined || s.time < first) first = s.time;
    if (last === undefined || s.time > last) last = s.time;
  }
  const userSegments = segments.filter((s) => s.role === 'user');
  const platforms: Partial<Record<Platform, number>> = {};
  for (const c of archive.conversations) platforms[c.platform] = (platforms[c.platform] ?? 0) + 1;
  const value = exposureScore(total);

  return {
    generatedAt: now.toISOString(),
    options,
    stats: {
      conversations: archive.conversations.length,
      scannedSegments: segments.filter(
        (s) => s.role === 'user' || (options.includeAssistant && s.role === 'assistant'),
      ).length,
      userMessages: userSegments.filter((s) => s.kind === 'message').length,
      words: userSegments.reduce((n, s) => n + (s.text.match(/\S+/g)?.length ?? 0), 0),
      first,
      last,
      platforms,
      sources: archive.sources,
      warnings: archive.warnings,
    },
    score: { value, level: scoreLevel(value), total },
    categories,
    findings,
    people: [...people.entries()]
      .map(([relation, e]) => ({
        relation,
        names: [...e.names].sort(),
        mentions: e.mentions,
        conversations: e.convs.size,
        minor: e.minor,
      }))
      .sort((a, b) => b.mentions - a.mentions),
    conversations,
    timeline: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
  };
}

const RELATION_ALIASES: Record<string, string> = {
  mom: 'mother',
  mum: 'mother',
  dad: 'father',
  grandma: 'grandmother',
  grandpa: 'grandfather',
  kids: 'children',
  kid: 'child',
  fiance: 'fiancé',
  fiancee: 'fiancée',
  'co-worker': 'coworker',
  neighbour: 'neighbor',
  flatmate: 'roommate',
  twins: 'children',
  boy: 'son',
  girl: 'daughter',
};
export function normalizeRelation(relation: string): string {
  const lower = relation.toLowerCase();
  return RELATION_ALIASES[lower] ?? lower;
}
