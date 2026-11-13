import { CATEGORIES } from './report.ts';
import { mask } from './mask.ts';
import type { Report } from './report.ts';
import type { Archive, Category, Finding } from './types.ts';

export const TOOL = {
  name: 'Memory Mirror',
  version: '1.0.0',
  url: 'https://github.com/ufodia/memory-mirror',
};

/**
 * The JSON report. Values are masked unless the user explicitly asks for raw
 * values. Conversation titles, source filenames and other metadata still need
 * review before this file is shared.
 */
export function reportJson(report: Report, includeRaw = false): string {
  const findings = report.findings.map((f) => ({
    id: f.id,
    category: f.category,
    type: f.type,
    label: f.label,
    value: includeRaw ? f.value : f.masked,
    confidence: f.confidence,
    role: f.role,
    source: f.kind,
    conversation: { id: f.conversationId, title: f.conversationTitle },
    time: f.time ? new Date(f.time).toISOString() : null,
    ...(includeRaw ? { context: `${f.before}${f.value}${f.after}` } : {}),
  }));
  return (
    JSON.stringify(
      {
        tool: TOOL,
        generatedAt: report.generatedAt,
        valuesMasked: !includeRaw,
        options: {
          ...report.options,
          watchlist: includeRaw
            ? report.options.watchlist
            : report.options.watchlist.map((value) =>
                mask({ category: 'watchlist', type: 'watch-word', value }),
              ),
        },
        stats: report.stats,
        score: report.score,
        categories: report.categories.map((c) => ({
          category: c.category,
          label: c.label,
          findings: c.findings,
          uniqueItems: c.unique,
          conversations: c.conversations,
          points: Number(c.points.toFixed(2)),
          items: c.items.map((i) => ({
            type: i.type,
            label: i.label,
            value: includeRaw ? i.value : i.masked,
            count: i.count,
            conversations: i.conversations,
          })),
        })),
        people: report.people.map((p) => ({
          ...p,
          names: includeRaw ? p.names : p.names.map((n) => `${n[0]}•••`),
        })),
        conversations: report.conversations,
        timeline: report.timeline,
        findings,
      },
      null,
      2,
    ) + '\n'
  );
}

const day = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : 'unknown date');

/** A Markdown checklist of conversations to review or delete, most revealing first. */
export function cleanupChecklist(report: Report, done: ReadonlySet<string> = new Set()): string {
  const lines = [
    '# Memory Mirror cleanup plan',
    '',
    `Generated ${report.generatedAt.slice(0, 10)} from ${report.stats.conversations} conversations. Exposure score: **${report.score.value}/100 (${report.score.level})**.`,
    '',
    'Open each conversation, decide whether to keep it, and delete it in the original app if it should not be stored. Deleting it here does nothing: Memory Mirror never had access to your account.',
    '',
  ];
  for (const c of report.conversations) {
    const tags = c.categories.map((cat) => CATEGORIES[cat].label).join(', ');
    const link = c.url ? `[${escapeMd(c.title)}](${c.url})` : escapeMd(c.title);
    lines.push(
      `- [${done.has(c.id) ? 'x' : ' '}] ${link} — ${day(c.created)} · ${c.findings} findings · ${tags}`,
    );
  }
  if (!report.conversations.length) lines.push('No conversations need attention.');
  lines.push(
    '',
    "Also review saved memories and custom instructions in each assistant's settings, and rotate any credential the report lists.",
    '',
  );
  return lines.join('\n');
}

const escapeMd = (text: string) => text.replace(/([\\[\]*_`<>])/g, '\\$1');

const PLACEHOLDER: Partial<Record<Category, string>> = {
  credentials: 'SECRET',
  'government-id': 'ID',
  financial: 'FINANCIAL',
  health: 'HEALTH',
  sensitive: 'SENSITIVE',
  location: 'LOCATION',
  contact: 'CONTACT',
  work: 'WORK',
  people: 'PERSON',
  identity: 'IDENTITY',
  watchlist: 'WATCHWORD',
};

/**
 * A redacted Markdown transcript. Every detected value is replaced with a
 * stable placeholder everywhere it appears, including the assistant's replies.
 */
export function redactedTranscript(archive: Archive, findings: Finding[]): string {
  const replaceable = findings.filter((f) => f.type !== 'relation' && f.value.length >= 2);
  const placeholders = new Map<string, string>();
  const counters = new Map<string, number>();
  for (const f of replaceable) {
    if (placeholders.has(f.value)) continue;
    const prefix = PLACEHOLDER[f.category] ?? 'REDACTED';
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    placeholders.set(f.value, `[${prefix}_${n}]`);
  }
  const values = [...placeholders.keys()].sort((a, b) => b.length - a.length);
  // One pass with whole-word boundaries, so "Mila" is replaced but "Milan" is left alone.
  const pattern = values.length
    ? new RegExp(
        `(?<![\\p{L}\\p{N}_])(?:${values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`,
        'gu',
      )
    : null;
  const redact = (text: string) => (pattern ? text.replace(pattern, (m) => placeholders.get(m) ?? m) : text);
  const lines = [
    '# Redacted transcript',
    '',
    `Generated by Memory Mirror. ${placeholders.size} distinct values were replaced with placeholders. Undetected personal details can remain — read before sharing.`,
    '',
  ];
  for (const c of archive.conversations) {
    lines.push(`## ${redact(c.title)}`, '', `_${c.platform} · ${day(c.created)}_`, '');
    for (const s of c.segments) {
      if (s.role === 'system' || s.role === 'tool') continue;
      const who =
        s.kind === 'memory'
          ? 'Saved memory'
          : s.kind === 'instructions'
            ? 'Custom instructions'
            : s.role === 'user'
              ? 'You'
              : 'Assistant';
      lines.push(`**${who}${s.kind === 'attachment' ? ' (attachment)' : ''}:**`, '', redact(s.text), '');
    }
  }
  return lines.join('\n');
}
