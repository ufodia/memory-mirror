import type { Report } from './core/report.ts';
import type { ScanOptions } from './core/types.ts';

/** Messages from the page to the analysis worker. `job` lets the page ignore stale answers. */
export type WorkerRequest =
  | { type: 'scan'; job: number; files: { name: string; bytes: ArrayBuffer }[]; options: ScanOptions }
  | { type: 'rescan'; job: number; options: ScanOptions }
  | { type: 'redact'; job: number }
  | { type: 'clear'; job: number };

export type WorkerResponse =
  | { type: 'progress'; job: number; message: string; ratio: number }
  | { type: 'report'; job: number; report: Report }
  | { type: 'redacted'; job: number; text: string }
  | { type: 'error'; job: number; message: string };
