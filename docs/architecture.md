# Architecture

Memory Mirror is a static Vite application written in strict TypeScript, with no framework and one runtime dependency ([fflate](https://github.com/101arrowz/fflate) for zip archives).

```
index.html          static intro, privacy promises and export instructions
src/main.ts         page state, rendering, downloads
src/dom.ts          text-only element factory, SVG helper, download helper
src/worker.ts       Web Worker: holds the archive, runs scans, builds redactions
src/protocol.ts     typed messages between page and worker
src/demo.ts         synthetic chat exports and supplied memories
src/core/
  types.ts          Conversation, Segment, Finding, ScanOptions
  parse.ts          zip, native chat adapters, role/content JSON, JSONL, memory and text readers
  validators.ts     Luhn, IBAN MOD 97, Turkish ID, US SSN, phone shape
  lexicon.ts        context-sensitive term lists
  detect.ts         ordered detector rules, first-person check, overlap resolution
  mask.ts           privacy-screen masking by type
  report.ts         categories, scoring, people, conversation ranking, timeline
  exports.ts        masked/raw JSON, cleanup checklist, redacted transcript
```

## Data flow

1. The page reads each selected file into an `ArrayBuffer` and **transfers** it to the worker (no copy).
2. `readUpload` checks the ZIP signature. Inside archives, `unzipSync` receives a filter for supported conversation or memory JSON names, with a ceiling of 1.5 billion uncompressed bytes per selected entry and 2 billion across selected entries. The interface's selected-input ceiling is 1.5 billion bytes. These checks do not guarantee that a device has enough memory to process the input.
3. Native ChatGPT trees, Claude `chat_messages` lists, Open WebUI wrapped/legacy history, direct SillyTavern JSONL, normalized role/content JSON, memories and text are normalized to `Conversation → Segment[]`. Platforms are labeled `chatgpt`, `claude`, `openwebui`, `sillytavern` or `text`. Only supported ChatGPT/Claude identifiers produce account-side links; other hosts and URLs are not guessed. Every segment carries its role (`user`, `assistant`, …) and kind (`message`, `attachment`, `instructions`, `memory`, `document`). Text or Markdown with a memory filename, such as `memories.txt` or `saved-memories.md`, receives memory-context handling.
4. `buildReport` runs `detect` over the selected segments and aggregates findings into categories, people, ranked conversations and a monthly timeline. Context snippets (±72 characters) are computed in the worker.
5. The worker posts only the report back. The archive stays in the worker so the redacted transcript can be produced on demand.

Every request carries a `job` number. The page ignores responses that do not belong to the current request. A job identifier prevents stale report rendering; it is not by itself a cancellation mechanism for synchronous parsing or detection.

## Worker protocol

| Page → worker | Purpose |
| --- | --- |
| `{ type: 'scan', job, files, options }` | Parse files and build a report |
| `{ type: 'rescan', job, options }` | Re-run detection with new options on the held archive |
| `{ type: 'redact', job }` | Build the redacted Markdown transcript |
| `{ type: 'clear', job }` | Drop the archive from memory |

| Worker → page | Purpose |
| --- | --- |
| `{ type: 'progress', job, message, ratio }` | Progress text and a 0–1 ratio |
| `{ type: 'report', job, report }` | The finished report |
| `{ type: 'redacted', job, text }` | Markdown to download |
| `{ type: 'error', job, message }` | A user-facing explanation |

## Report format

`memory-mirror-report.json` contains:

```jsonc
{
  "tool": { "name": "Memory Mirror", "version": "1.0.0", "url": "…" },
  "generatedAt": "2026-11-13T00:00:00.000Z",
  "valuesMasked": true,
  "options": { "includeAssistant": false, "watchlist": [] },
  "stats": { "conversations": 9, "userMessages": 10, "words": 241, "first": 0, "last": 0, "platforms": {}, "sources": [], "warnings": [] },
  "score": { "value": 94, "level": "Very high", "total": 112.4 },
  "categories": [{ "category": "health", "label": "Health", "findings": 6, "uniqueItems": 5, "conversations": 3, "points": 20.68, "items": [] }],
  "people": [{ "relation": "daughter", "names": ["M•••"], "mentions": 3, "conversations": 2, "minor": true }],
  "conversations": [{ "id": "…", "title": "…", "platform": "chatgpt", "url": "https://chatgpt.com/c/…", "points": 21.6, "findings": 5, "categories": [] }],
  "timeline": [{ "month": "2026-03", "count": 6 }],
  "findings": [{ "id": "f1", "category": "health", "type": "medication", "label": "Medication", "value": "s•••••••", "confidence": "high", "role": "user", "source": "message", "conversation": { "id": "…", "title": "…" }, "time": "…" }]
}
```

The standard report masks matched values and supplied watch words. It retains titles, source filenames, identifiers, links, dates and aggregate data, so it is not an anonymized document. The raw report preserves exact watch words and adds unmasked `value`s and a `context` field to each finding. See [download limits](privacy.md#downloads-and-redaction).

## Format contracts

See [input formats](input-formats.md) for the supported roots, native adapters and synthetic examples. Open WebUI prefers readable history nodes over the flat-message fallback. SillyTavern reads explicit role flags and `mes` text from direct JSONL/NDJSON files. Normalized JSON accepts only the documented role/content forms; unsupported objects are not coerced to strings. These adapters do not imply native compatibility with every model provider's export.

## Testing

- **Unit tests** (`tests/`, Vitest): validators, every detector family, overlap rules, export parsing, zip filtering, scoring, masking and all exports.
- **Browser tests** (`e2e/`, Playwright with Chromium): the demo report, reveal and privacy screen, people and cleanup, masked/raw/redacted downloads, a real zip upload with watch words, hostile HTML in imports, unsupported files and a 390 px phone layout.
- **Hosting tests**: production-only canonical, sitemap and absolute social image; preview builds stay `noindex`.
