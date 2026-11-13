/** Where a conversation came from. */
export type Platform = 'chatgpt' | 'claude' | 'openwebui' | 'sillytavern' | 'text';

/** Who produced a piece of text inside a conversation. */
export type Role = 'user' | 'assistant' | 'system' | 'tool';

/**
 * What kind of text a segment is. Attachments, custom instructions and saved
 * memories were all sent to the assistant, so they are scanned like messages.
 */
export type SegmentKind = 'message' | 'attachment' | 'instructions' | 'memory' | 'document';

export interface Segment {
  id: string;
  conversationId: string;
  role: Role;
  kind: SegmentKind;
  text: string;
  /** Milliseconds since the Unix epoch, when the export provides it. */
  time?: number;
}

export interface Conversation {
  id: string;
  title: string;
  platform: Platform;
  /** Link that opens the conversation in its original app, for review or deletion. */
  url?: string;
  created?: number;
  updated?: number;
  segments: Segment[];
}

export interface Archive {
  conversations: Conversation[];
  /** Names of the files that contributed data. */
  sources: string[];
  /** Non-fatal problems, shown to the user. */
  warnings: string[];
}

export type Category =
  | 'credentials'
  | 'government-id'
  | 'financial'
  | 'health'
  | 'sensitive'
  | 'location'
  | 'contact'
  | 'work'
  | 'people'
  | 'identity'
  | 'watchlist';

export type Confidence = 'high' | 'medium';

export interface Finding {
  id: string;
  category: Category;
  /** Machine-readable detector name, for example `email` or `health-condition`. */
  type: string;
  /** Human-readable description of the detector. */
  label: string;
  /** The exact detected text. Kept in memory only; masked in the interface and exports by default. */
  value: string;
  /** Normalized value used to count unique items. */
  key: string;
  start: number;
  end: number;
  segmentId: string;
  conversationId: string;
  role: Role;
  kind: SegmentKind;
  confidence: Confidence;
  time?: number;
  /** For people findings: the relationship, for example `daughter`. */
  relation?: string;
}

export interface ScanOptions {
  /** Also scan what the assistant wrote. Off by default: the report is about what you shared. */
  includeAssistant: boolean;
  /** Extra exact words to look for, such as a child's name or a project codename. */
  watchlist: string[];
}

export const DEFAULT_OPTIONS: ScanOptions = { includeAssistant: false, watchlist: [] };
