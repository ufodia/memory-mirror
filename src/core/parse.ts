import { unzipSync } from 'fflate';
import type { Archive, Conversation, Role, SegmentKind } from './types.ts';

/** Input ceilings; browser memory availability can require substantially smaller files. */
export const LIMITS = {
  /** Largest single file accepted from a zip archive, uncompressed. */
  entryBytes: 1_500_000_000,
  /** Largest total of accepted entries, uncompressed. */
  totalBytes: 2_000_000_000,
};

export class ExportError extends Error {}

const decoder = new TextDecoder('utf-8');
const decode = (bytes: Uint8Array) => decoder.decode(bytes).replace(/^﻿/, '');
const toMs = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(new Date(milliseconds).getTime()) ? milliseconds : undefined;
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** Files inside an export archive that hold conversation data. Other files are never decompressed. */
export const RELEVANT_ENTRY = /(?:^|\/)(?:conversations?[^/]*|memories[^/]*|memory[^/]*)\.json$/i;

/** Read any supported upload: an export .zip, a .json file, or plain text / Markdown. */
export function readUpload(name: string, bytes: Uint8Array): Archive {
  if (bytes.byteLength > LIMITS.entryBytes)
    throw new ExportError(`${name} is larger than this browser tab can safely read.`);
  if (isZip(bytes)) return readZip(name, bytes);
  const text = decode(bytes);
  if (/\.json$/i.test(name) || /^\s*[[{]/.test(text)) return parseJsonText(name, text);
  const kind = /(?:^|[\\/_. -])memor(?:y|ies)(?:[_. -]|$)/i.test(name) ? 'memory' : 'document';
  return parseText(name, text, kind);
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function readZip(name: string, bytes: Uint8Array): Archive {
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        if (!RELEVANT_ENTRY.test(file.name) || /__MACOSX\//.test(file.name)) return false;
        if (
          !Number.isSafeInteger(file.originalSize) ||
          file.originalSize < 0 ||
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          (file.compression === 0 && file.size !== file.originalSize)
        )
          throw new ExportError(`${file.name} has inconsistent zip entry sizes.`);
        if (file.originalSize > LIMITS.entryBytes || total + file.originalSize > LIMITS.totalBytes) {
          throw new ExportError(`${file.name} is larger than this browser tab can safely read.`);
        }
        total += file.originalSize;
        return true;
      },
    });
  } catch (error) {
    if (error instanceof ExportError) throw error;
    throw new ExportError(`${name} is not a readable zip archive.`);
  }
  const names = Object.keys(entries).sort();
  if (!names.length)
    throw new ExportError(
      `${name} does not contain conversations.json. Use your ChatGPT export archive, or open its conversations.json directly.`,
    );
  return mergeArchives(names.map((entry) => parseJsonText(`${name} › ${entry}`, decode(entries[entry]))));
}

/** Parse a JSON document and recognize a ChatGPT export, transcript list or memory file. */
export function parseJsonText(name: string, text: string): Archive {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ExportError(`${name} is not valid JSON.`);
  }
  return parseData(name, data);
}

function parseData(name: string, data: unknown): Archive {
  if (Array.isArray(data) && data.some((item) => isRecord(item) && isRecord(item.mapping)))
    return parseChatGpt(name, data);
  if (Array.isArray(data) && data.some((item) => isRecord(item) && Array.isArray(item.chat_messages)))
    return parseConversationList(name, data);
  if (isRecord(data) && Array.isArray(data.conversations)) return parseData(name, data.conversations);
  if (/memor/i.test(name)) return parseMemories(name, data);
  if (Array.isArray(data) && data.length === 0)
    return { conversations: [], sources: [name], warnings: [`${name} contains no conversations.`] };
  throw new ExportError(
    `${name} is not a recognized ChatGPT export or transcript. Open the conversations.json file from your data export.`,
  );
}

interface ChatGptNode {
  message?: {
    id?: string;
    author?: { role?: string };
    create_time?: number | null;
    content?: {
      content_type?: string;
      parts?: unknown[];
      text?: string;
      user_profile?: string;
      user_instructions?: string;
    };
    metadata?: { attachments?: { name?: string }[] };
  } | null;
}

const ROLES: Record<string, Role> = {
  user: 'user',
  human: 'user',
  assistant: 'assistant',
  system: 'system',
  tool: 'tool',
};

/** ChatGPT exports store each conversation as a tree of message nodes keyed by ID. */
export function parseChatGpt(name: string, data: unknown[]): Archive {
  const conversations: Conversation[] = [];
  const warnings: string[] = [];
  data.forEach((raw, index) => {
    if (!isRecord(raw) || !isRecord(raw.mapping)) return;
    const id = str(raw.conversation_id) || str(raw.id) || `chatgpt-${index + 1}`;
    const conversation: Conversation = {
      id,
      title: str(raw.title).trim() || 'Untitled conversation',
      platform: 'chatgpt',
      url: /^[\w-]{8,}$/.test(id) ? `https://chatgpt.com/c/${id}` : undefined,
      created: toMs(raw.create_time),
      updated: toMs(raw.update_time),
      segments: [],
    };
    const nodes = Object.values(raw.mapping as Record<string, ChatGptNode>)
      .map((node) => node?.message)
      .filter((message): message is NonNullable<ChatGptNode['message']> => isRecord(message))
      .sort((a, b) => (toMs(a.create_time) ?? 0) - (toMs(b.create_time) ?? 0));
    for (const message of nodes) {
      const role = ROLES[str(message.author?.role)] ?? 'tool';
      const content = message.content ?? {};
      const time = toMs(message.create_time) ?? conversation.created;
      if (content.content_type === 'user_editable_context') {
        const text = [content.user_profile, content.user_instructions].filter(Boolean).join('\n\n');
        push(conversation, 'user', 'instructions', text, time);
        continue;
      }
      const parts = Array.isArray(content.parts)
        ? content.parts.filter((p): p is string => typeof p === 'string')
        : [];
      const text = parts.length ? parts.join('\n') : str(content.text);
      push(conversation, role, 'message', text, time);
      const attachments = message.metadata?.attachments;
      for (const attachment of Array.isArray(attachments) ? attachments : [])
        if (isRecord(attachment) && str(attachment.name))
          push(conversation, role, 'attachment', `Attached file: ${str(attachment.name)}`, time);
    }
    conversations.push(conversation);
  });
  if (!conversations.length) warnings.push(`${name} has no readable ChatGPT conversations.`);
  return { conversations, sources: [name], warnings };
}

/** A normalized transcript can list conversations with a flat `chat_messages` array. */
export function parseConversationList(name: string, data: unknown[]): Archive {
  const conversations: Conversation[] = [];
  data.forEach((raw, index) => {
    if (!isRecord(raw) || !Array.isArray(raw.chat_messages)) return;
    const id = str(raw.uuid) || `transcript-${index + 1}`;
    const conversation: Conversation = {
      id,
      title: str(raw.name).trim() || 'Untitled conversation',
      platform: 'text',
      created: toMs(raw.created_at),
      updated: toMs(raw.updated_at),
      segments: [],
    };
    for (const message of raw.chat_messages) {
      if (!isRecord(message)) continue;
      const role = ROLES[str(message.sender)] ?? 'tool';
      const time = toMs(message.created_at) ?? conversation.created;
      const blocks = Array.isArray(message.content) ? message.content : [];
      const text =
        str(message.text) ||
        blocks
          .filter((block) => isRecord(block) && block.type === 'text')
          .map((block) => str((block as Record<string, unknown>).text))
          .join('\n');
      push(conversation, role, 'message', text, time);
      for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
        if (!isRecord(attachment)) continue;
        const fileName = str(attachment.file_name) || 'attachment';
        const body = str(attachment.extracted_content);
        push(
          conversation,
          role,
          'attachment',
          body ? `${fileName}\n${body}` : `Attached file: ${fileName}`,
          time,
        );
      }
      for (const file of Array.isArray(message.files) ? message.files : [])
        if (isRecord(file) && str(file.file_name))
          push(conversation, role, 'attachment', `Attached file: ${str(file.file_name)}`, time);
    }
    conversations.push(conversation);
  });
  return {
    conversations,
    sources: [name],
    warnings: conversations.length ? [] : [`${name} has no readable transcript conversations.`],
  };
}

/** Memory files vary between products and versions, so every string value is treated as a saved memory. */
export function parseMemories(name: string, data: unknown): Archive {
  const conversation: Conversation = {
    id: `memories:${name}`,
    title: 'Saved memories',
    platform: 'text',
    segments: [],
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > 12) return;
    if (typeof value === 'string') push(conversation, 'user', 'memory', value);
    else if (Array.isArray(value)) value.forEach((item) => visit(item, depth + 1));
    else if (isRecord(value))
      for (const [key, item] of Object.entries(value)) {
        if (/(?:^|_)(?:id|uuid|created_at|updated_at|type)$/i.test(key)) continue;
        visit(item, depth + 1);
      }
  };
  visit(data, 0);
  return { conversations: conversation.segments.length ? [conversation] : [], sources: [name], warnings: [] };
}

/** Plain text or Markdown: saved memories copied from settings, or any transcript. */
export function parseText(name: string, text: string, kind: SegmentKind = 'document'): Archive {
  const conversation: Conversation = { id: `text:${name}`, title: name, platform: 'text', segments: [] };
  push(conversation, 'user', kind, text);
  return { conversations: conversation.segments.length ? [conversation] : [], sources: [name], warnings: [] };
}

export function mergeArchives(archives: Archive[]): Archive {
  const seen = new Set<string>();
  const conversations: Conversation[] = [];
  for (const archive of archives)
    for (const conversation of archive.conversations) {
      let id = conversation.id;
      for (let n = 2; seen.has(id); n++) id = `${conversation.id}#${n}`;
      seen.add(id);
      if (id !== conversation.id) {
        conversation.id = id;
        conversation.segments.forEach((segment, index) => {
          segment.conversationId = id;
          segment.id = `${id}:${index}`;
        });
      }
      conversations.push(conversation);
    }
  return {
    conversations,
    sources: archives.flatMap((a) => a.sources),
    warnings: archives.flatMap((a) => a.warnings),
  };
}

function push(conversation: Conversation, role: Role, kind: SegmentKind, text: string, time?: number) {
  const clean = text.replace(/\u0000/g, '').trim();
  if (!clean) return;
  conversation.segments.push({
    id: `${conversation.id}:${conversation.segments.length}`,
    conversationId: conversation.id,
    role,
    kind,
    text: clean,
    time,
  });
}
