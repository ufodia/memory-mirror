import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cleanupChecklist, redactedTranscript, reportJson } from '../src/core/exports.ts';
import { mask } from '../src/core/mask.ts';
import { ExportError, mergeArchives, readUpload } from '../src/core/parse.ts';
import { buildReport, categoryPoints, exposureScore, scoreLevel } from '../src/core/report.ts';
import { DEFAULT_OPTIONS } from '../src/core/types.ts';
import { DEMO_CHATGPT, DEMO_TRANSCRIPTS, DEMO_MEMORIES, demoFiles } from '../src/demo.ts';

const json = (value: unknown) => strToU8(JSON.stringify(value));
const demoArchive = () => mergeArchives(demoFiles().map((f) => readUpload(f.name, f.bytes)));

describe('export parsing', () => {
  it('reads ChatGPT trees, custom instructions and conversation links', () => {
    const archive = readUpload('conversations.json', json(DEMO_CHATGPT));
    expect(archive.conversations).toHaveLength(6);
    const first = archive.conversations[0];
    expect(first.platform).toBe('chatgpt');
    expect(first.url).toBe('https://chatgpt.com/c/demo-a7f3c2e1-meal-plan');
    expect(first.segments[0]).toMatchObject({ kind: 'instructions', role: 'user' });
    expect(first.segments.map((s) => s.role)).toEqual(['user', 'user', 'assistant']);
  });

  it('reads normalized transcript messages and attachment names without provider links', () => {
    const archive = readUpload('conversations.json', json(DEMO_TRANSCRIPTS));
    expect(archive.conversations.map((c) => c.platform)).toEqual(['text', 'text']);
    expect(archive.conversations[0].url).toBeUndefined();
    expect(archive.conversations[0].segments.find((s) => s.kind === 'attachment')?.text).toBe(
      'Attached file: bank-statement-september.pdf',
    );
  });

  it('reads memory files as statements about the user', () => {
    const archive = readUpload('demo-memories.json', json(DEMO_MEMORIES));
    expect(archive.conversations[0].segments.map((s) => s.kind)).toEqual(['memory', 'memory', 'memory']);
  });

  it('opens only conversation and memory files from a zip', () => {
    const zip = zipSync({
      'export/conversations.json': json(DEMO_CHATGPT),
      'export/chat.html': strToU8('<html>ignored</html>'),
      'export/user.json': json({ email: 'account@example.com' }),
    });
    const archive = readUpload('chatgpt-export.zip', zip);
    expect(archive.conversations).toHaveLength(6);
    expect(archive.sources).toEqual(['chatgpt-export.zip › export/conversations.json']);
  });

  it('explains unsupported input', () => {
    expect(() => readUpload('notes.json', strToU8('{"hello": 1}'))).toThrow(ExportError);
    expect(() => readUpload('broken.json', strToU8('[{'))).toThrow(/not valid JSON/);
    expect(() => readUpload('empty.zip', zipSync({ 'a.txt': strToU8('x') }))).toThrow(/conversations\.json/);
  });

  it('ignores malformed optional attachment metadata and invalid dates', () => {
    const archive = readUpload(
      'conversations.json',
      json([
        {
          id: 'synthetic-conversation',
          create_time: Number.MAX_VALUE,
          update_time: -Number.MAX_VALUE,
          mapping: {
            a: {
              message: {
                author: { role: 'user' },
                create_time: Number.MAX_VALUE,
                content: { parts: ['Email synthetic@example.com'] },
                metadata: { attachments: { malformed: true } },
              },
            },
            b: {
              message: {
                author: { role: 'user' },
                content: { parts: ['A second message'] },
                metadata: { attachments: [null, false, { name: 123 }, { name: 'notes.txt' }] },
              },
            },
          },
        },
      ]),
    );
    expect(archive.conversations[0].created).toBeUndefined();
    expect(archive.conversations[0].updated).toBeUndefined();
    expect(archive.conversations[0].segments.map((s) => s.text)).toEqual([
      'Email synthetic@example.com',
      'A second message',
      'Attached file: notes.txt',
    ]);
    expect(() => reportJson(buildReport(archive, DEFAULT_OPTIONS))).not.toThrow();
  });

  it('rejects inconsistent stored ZIP sizes before reading its JSON', () => {
    const bytes = zipSync({ 'conversations.json': [json(DEMO_CHATGPT), { level: 0 }] });
    const central = bytes.findIndex(
      (value, i) => value === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2,
    );
    expect(central).toBeGreaterThan(0);
    new DataView(bytes.buffer).setUint32(central + 24, 1, true);
    expect(() => readUpload('corrupted.zip', bytes)).toThrow(/inconsistent zip entry sizes/);
  });

  it('rejects declared oversized compressed ZIP entries before allocating them', () => {
    const bytes = zipSync({ 'conversations.json': json(DEMO_CHATGPT) });
    const central = bytes.findIndex(
      (value, i) => value === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 1 && bytes[i + 3] === 2,
    );
    new DataView(bytes.buffer).setUint32(central + 24, 1_500_000_001, true);
    expect(() => readUpload('oversized.zip', bytes)).toThrow(/larger than this browser tab/);
  });

  it('treats plain text as a document and keeps duplicate IDs apart', () => {
    const text = readUpload('memories.txt', strToU8('I live in Lisbon.'));
    expect(text.conversations[0].segments[0]).toMatchObject({ kind: 'memory', role: 'user' });
    const merged = mergeArchives([
      readUpload('a.json', json(DEMO_TRANSCRIPTS)),
      readUpload('b.json', json(DEMO_TRANSCRIPTS)),
    ]);
    expect(new Set(merged.conversations.map((c) => c.id)).size).toBe(4);
    expect(merged.conversations[2].segments[0].id.startsWith(merged.conversations[2].id)).toBe(true);
  });

  it('applies saved-memory context to copied memories.txt and Markdown files', () => {
    for (const name of ['memories.txt', 'saved-memories.md']) {
      const archive = readUpload(name, strToU8('Has a daughter named Mila. Works at Brightfield Labs.'));
      const report = buildReport(archive, DEFAULT_OPTIONS);
      expect(report.findings.map((f) => [f.type, f.value])).toEqual([
        ['named-person', 'Mila'],
        ['employer', 'Brightfield Labs'],
      ]);
    }
  });
});

describe('report', () => {
  const report = buildReport(demoArchive(), DEFAULT_OPTIONS, { now: new Date('2026-11-13T00:00:00Z') });

  it('covers every major category in the synthetic demo', () => {
    expect(report.categories.map((c) => c.category).sort()).toEqual(
      [
        'contact',
        'credentials',
        'financial',
        'government-id',
        'health',
        'identity',
        'location',
        'people',
        'sensitive',
        'work',
      ].sort(),
    );
    expect(report.stats.conversations).toBe(9);
    expect(report.score.level).toBe('Very high');
  });

  it('keeps the generic diabetes question out of the report', () => {
    expect(report.conversations.find((c) => c.title === 'What is diabetes?')).toBeUndefined();
  });

  it('lists people with relations and names', () => {
    const daughter = report.people.find((p) => p.relation === 'daughter');
    expect(daughter).toMatchObject({ names: ['Mila'], minor: true });
    expect(report.people.find((p) => p.relation === 'mother')?.names).toEqual(['Linda']);
  });

  it('ranks the most revealing conversation first and builds a timeline', () => {
    expect(report.conversations[0].points).toBeGreaterThanOrEqual(report.conversations.at(-1)!.points);
    expect(report.timeline[0].month).toBe('2026-03');
  });

  it('scores with diminishing returns', () => {
    expect(categoryPoints('credentials', 1)).toBe(10);
    expect(categoryPoints('credentials', 3)).toBe(20);
    expect(exposureScore(0)).toBe(0);
    expect(exposureScore(40)).toBe(63);
    expect(scoreLevel(24)).toBe('Low');
    expect(scoreLevel(75)).toBe('Very high');
  });
});

describe('exports', () => {
  const archive = demoArchive();
  const report = buildReport(archive, DEFAULT_OPTIONS);

  it('masks values unless raw export is requested', () => {
    const masked = reportJson(report);
    expect(masked).not.toContain('4242 4242 4242 4242');
    expect(masked).not.toContain('hunter2demo');
    expect(masked).toContain('••••4242');
    expect(reportJson(report, true)).toContain('4242 4242 4242 4242');
  });

  it('masks by type', () => {
    expect(mask({ type: 'email', category: 'contact', value: 'jordan.avery@example.com' })).toBe(
      'j••••••••@e••••••.com',
    );
    expect(mask({ type: 'iban', category: 'financial', value: 'GB82 WEST 1234 5698 7654 32' })).toBe(
      'GB82 •••••••• 5432',
    );
    expect(mask({ type: 'medication', category: 'health', value: 'sertraline' })).toBe('s••••••••');
  });

  it('masks private watch words even when they did not match any message', () => {
    const privateOptions = { ...DEFAULT_OPTIONS, watchlist: ['SyntheticSecretCodename'] };
    const privateReport = buildReport(archive, privateOptions);
    const masked = reportJson(privateReport);
    expect(masked).not.toContain('SyntheticSecretCodename');
    expect(JSON.parse(masked).options.watchlist).toEqual(['S••••••••e']);
    expect(reportJson(privateReport, true)).toContain('SyntheticSecretCodename');
  });

  it('does not retain private-key payloads in masked reports or redacted transcripts', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nSYNTHETIC-SECRET-PAYLOAD\n-----END PRIVATE KEY-----';
    const keyArchive = readUpload('notes.txt', strToU8(`Please review:\n${key}\nAfter the key.`));
    const keyReport = buildReport(keyArchive, DEFAULT_OPTIONS);
    expect(keyReport.findings[0].value).toBe(key);
    expect(reportJson(keyReport)).not.toContain('SYNTHETIC-SECRET-PAYLOAD');
    expect(redactedTranscript(keyArchive, keyReport.findings)).toContain('[SECRET_1]');
    expect(redactedTranscript(keyArchive, keyReport.findings)).not.toContain('SYNTHETIC-SECRET-PAYLOAD');
    expect(redactedTranscript(keyArchive, keyReport.findings)).toContain('After the key.');
  });

  it('does not let an overlapping watch word leave a credential payload unredacted', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nSYNTHETIC-SECRET-PAYLOAD\n-----END PRIVATE KEY-----';
    const keyArchive = readUpload('notes.txt', strToU8(key));
    const keyReport = buildReport(keyArchive, { ...DEFAULT_OPTIONS, watchlist: ['PRIVATE'] });
    expect(keyReport.findings.some((f) => f.type === 'private-key' && f.value === key)).toBe(true);
    expect(keyReport.findings.some((f) => f.type === 'watch-word')).toBe(true);
    expect(redactedTranscript(keyArchive, keyReport.findings)).not.toContain('SYNTHETIC-SECRET-PAYLOAD');
  });

  it('writes a cleanup checklist with links and done marks', () => {
    const first = report.conversations[0];
    const md = cleanupChecklist(report, new Set([first.id]));
    expect(md).toContain(`- [x] ${first.url ? `[${first.title}]` : first.title}`);
    expect(md).toContain('https://chatgpt.com/c/');
  });

  it('redacts values everywhere with stable placeholders and whole-word matching', () => {
    const md = redactedTranscript(archive, report.findings);
    expect(md).not.toContain('jordan.avery@example.com');
    expect(md).not.toContain('Mila');
    expect(md).toMatch(/\[PERSON_\d+\]/);
    expect(md).toContain('**Saved memory:**');
    const custom = redactedTranscript(
      {
        conversations: [
          {
            id: 'x',
            title: 'Trip',
            platform: 'text',
            segments: [
              { id: 'x:0', conversationId: 'x', role: 'user', kind: 'document', text: 'Mila flew to Milan.' },
            ],
          },
        ],
        sources: [],
        warnings: [],
      },
      [{ ...report.findings.find((f) => f.value === 'Mila')!, segmentId: 'x:0', conversationId: 'x' }],
    );
    expect(custom).toContain('[PERSON_1] flew to Milan.');
  });
});
