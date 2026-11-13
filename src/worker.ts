import { redactedTranscript } from './core/exports.ts';
import { ExportError, mergeArchives, readUpload } from './core/parse.ts';
import { buildReport } from './core/report.ts';
import type { Archive, ScanOptions } from './core/types.ts';
import type { WorkerRequest, WorkerResponse } from './protocol.ts';

/** The parsed archive stays inside the worker; the page only receives the report. */
let archive: Archive | null = null;
let lastFindings: ReturnType<typeof buildReport>['findings'] = [];

const post = (message: WorkerResponse) =>
  (self as unknown as { postMessage(value: WorkerResponse): void }).postMessage(message);

function scan(options: ScanOptions, job: number) {
  if (!archive) throw new ExportError('Open an export first.');
  post({ type: 'progress', job, message: 'Looking for personal details…', ratio: 0.5 });
  const report = buildReport(archive, options, {
    onProgress: (done, total) =>
      post({
        type: 'progress',
        job,
        message: `Scanning messages ${done.toLocaleString('en')} of ${total.toLocaleString('en')}…`,
        ratio: 0.5 + (done / Math.max(total, 1)) * 0.5,
      }),
  });
  lastFindings = report.findings;
  post({ type: 'report', job, report });
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'scan') {
      archive = null;
      lastFindings = [];
      const parts: Archive[] = [];
      request.files.forEach((file, index) => {
        post({
          type: 'progress',
          job: request.job,
          message: `Reading ${file.name}…`,
          ratio: (index / request.files.length) * 0.5,
        });
        parts.push(readUpload(file.name, new Uint8Array(file.bytes)));
      });
      archive = mergeArchives(parts);
      if (!archive.conversations.length)
        throw new ExportError('No conversations or memories were found in these files.');
      scan(request.options, request.job);
    } else if (request.type === 'rescan') {
      scan(request.options, request.job);
    } else if (request.type === 'redact') {
      if (!archive) throw new ExportError('Open an export first.');
      post({ type: 'redacted', job: request.job, text: redactedTranscript(archive, lastFindings) });
    } else if (request.type === 'clear') {
      archive = null;
      lastFindings = [];
    }
  } catch (error) {
    const message =
      error instanceof ExportError
        ? error.message
        : error instanceof RangeError
          ? 'This export is too large for this browser tab. Try a desktop browser with more memory, or open conversations.json on its own.'
          : 'The file could not be read. Make sure it is an unmodified ChatGPT or Claude export, or a supported transcript.';
    post({ type: 'error', job: 'job' in request ? request.job : 0, message });
  }
});
