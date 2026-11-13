# Input formats

Memory Mirror reviews the text you supply. It does not connect to a model account, request an export, fetch missing attachments, or translate arbitrary provider formats automatically.

All examples below are **synthetic fixtures**. They describe accepted input structures, not measured model output or a real person's chat history.

Ready-to-open repository fixtures: [Open WebUI](../examples/openwebui-synthetic.json), [normalized JSON](../examples/normalized-synthetic.json), and [SillyTavern JSONL](../examples/sillytavern-synthetic.jsonl).

## Compatibility at a glance

| Format | Open directly | What is read | Source-app link |
| --- | --- | --- | --- |
| ChatGPT export | `.zip` or supported `.json` | Readable `mapping` message nodes, supported instruction fields and attachment names | Generated for supported conversation IDs |
| Claude export | `.zip` or supported `.json` | `chat_messages` text or supported text blocks and supplied attachment text fields | Generated for supported conversation UUIDs |
| Open WebUI export | Native `.json` | Wrapped or legacy `history.messages`; flat `messages` fallback when there is no readable history text | None; the host is not inferred |
| SillyTavern chat | `.jsonl` or `.ndjson` | Message `mes` fields with explicit role flags; optional first metadata record is ignored | None |
| Normalized chat JSON | `.json` | The role/content contract below | None |
| Copied memories | Memory-named `.txt` or `.md`, or supported memory JSON | Supplied strings, with memory-context detection | None |
| Plain text / Markdown | `.txt` or `.md` | Supplied text, treated as user-authored | None |

Use Open WebUI and SillyTavern's direct files. ZIP import selectively reads supported conversation or memory `.json` names; it is not an arbitrary archive browser, and JSONL must be opened directly. See [input limits](user-guide.md#input-limits).

## ChatGPT and Claude

Request an export using the current official instructions for your eligible account:

- [OpenAI: Exporting your ChatGPT history and data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data).
- [Claude: Export your data](https://support.claude.com/en/articles/9450526-export-your-claude-data).

Account and workspace restrictions can affect access. An export is not an inventory of everything the provider retains. The reader only analyzes supported text present in the selected input; it cannot recover deleted content. Image and audio contents are not analyzed.

The ChatGPT reader visits readable nodes across the supplied message tree. The Claude reader visits supported message lists. Where an export supplies attachment names or supported extracted-text fields, those strings can be reviewed; the app does not open the original uploaded files or perform OCR.

## Open WebUI JSON

Open WebUI documents a native `chat` wrapper and a legacy unwrapped structure in its [official import/export reference](https://github.com/open-webui/docs/blob/main/docs/features/chat-conversations/data-controls/import-export.md). Memory Mirror accepts a conversation object or an array of these objects. It prefers readable `history.messages` text over the flat `messages` fallback so the same text is not counted twice merely because both are present.

Save this synthetic example as `openwebui-example.json`:

```json
[
  {
    "chat": {
      "title": "Synthetic profile review",
      "history": {
        "currentId": "m1",
        "messages": {
          "m1": {
            "id": "m1",
            "parentId": null,
            "childrenIds": [],
            "role": "user",
            "content": "My name is Avery Sample. My email is avery@example.test."
          }
        }
      }
    }
  }
]
```

Every readable history node is considered, including branches outside `currentId`. This can include alternate messages you no longer regard as the active conversation. The platform is labeled `openwebui`; Memory Mirror cannot infer the address or access rules of your hosted instance, so it does not guess a conversation URL.

## SillyTavern JSONL / NDJSON

Use SillyTavern's JSONL chat export described in its [official chat-file documentation](https://docs.sillytavern.app/usage/core-concepts/chatfilemanagement/). JSONL contains one JSON object per line, rather than a JSON array. Open the `.jsonl` or `.ndjson` file directly.

Save these three synthetic lines as `sillytavern-example.jsonl`:

```jsonl
{"user_name":"Demo user","character_name":"Demo assistant","chat_metadata":{}}
{"name":"Demo user","is_user":true,"is_system":false,"mes":"My email is avery@example.test."}
{"name":"Demo assistant","is_user":false,"is_system":false,"mes":"This is a synthetic reply."}
```

The optional first metadata record is ignored. Each message needs a string `mes` and an explicit boolean `is_user`, unless it is marked `is_system: true`. User messages are scanned by default; assistant messages require **Also scan assistant replies**. System messages remain excluded. The reader uses `mes`, not swipe alternatives, reasoning fields, character metadata, images or attachments. A supported `send_date` can provide a date; missing dates remain unknown.

Malformed JSON or unsupported message records produce an import error with the filename and line number, without echoing the message contents. The platform is labeled `sillytavern`, with no guessed source URL.

The JSONL reader limits each line to **4,000,000 UTF-16 code units** and a file to **100,000 nonblank records**, including an optional metadata header. Blank lines are ignored and a leading byte-order mark is supported. These are validation ceilings, not a promise that every file below them will fit a device's available memory.

## Normalized role/content JSON

This is Memory Mirror's documented interchange contract. It is useful for another frontend or a local conversion, but is **not** a claim that every vendor's native archive is supported.

The smallest useful object is:

```json
{
  "title": "Synthetic normalized conversation",
  "messages": [
    {
      "role": "user",
      "content": "My name is Avery Sample. My email is avery@example.test."
    },
    {
      "role": "assistant",
      "content": "This is a synthetic reply."
    }
  ]
}
```

Accepted roots are:

- A bare message array, such as `[{"role":"user","content":"Synthetic message"}]`.
- One object with a `messages` array, optionally carrying `id` and `title`.
- An array of conversation objects, each with `messages`.
- An object whose `conversations` array contains supported conversation objects.

### Roles and content

| Field | Accepted values | Review behavior |
| --- | --- | --- |
| `role` | `user`, `human`, `assistant`, `system`, `tool` | `human` becomes user. Assistant text is opt-in. System/tool text is excluded. An unknown role is handled as tool text with a warning, rather than silently becoming user text. |
| `content` | A string; or an array of strings and supported text blocks | Text blocks need `type: "text"`, `"input_text"` or `"output_text"` and a string `text`. Other objects are not coerced into text. |
| Conversation metadata | Optional supported IDs, titles and dates | Used when recognized; not a provider-account connection or deletion link. |

Preserve roles during conversion. Do not relabel a system or assistant message as user merely to make it appear in the report. Plain `.txt` and `.md` cannot preserve structured role attribution; all supplied text is treated as user-authored.

Normalized inputs use the `text` platform label. They do not prove which provider or model generated a conversation.

## Other providers and local models

Gemini, Grok, DeepSeek, Copilot and Mistral native exports are **not advertised as directly compatible**. To review those conversations:

1. Use a supported frontend's export when it has the documented structure; or
2. Convert the available text locally into the role/content contract above; or
3. Review a plain-text copy, understanding that structured roles, dates and source links may be lost.

A model name, API response, screenshot or file extension alone is not evidence of compatibility. Keep only supported text fields during normalization, check the resulting message count and roles, and try a small synthetic fixture first. Do not upload a private export to an untrusted conversion service.

Memory Mirror outputs are review artifacts. They are not guaranteed to re-import into ChatGPT, Claude, Open WebUI, SillyTavern or another account.

## Shared limits

- The parser only sees supplied text. Missing, encrypted, deleted or image-only content remains outside the review.
- Combining overlapping inputs can repeat conversations and findings. Avoid importing an archive and a copy of its extracted data together.
- Some source formats carry more metadata than the reader uses. An accepted file does not mean every field was analyzed.
- Findings are heuristic; absence of findings does not prove absence of sensitive content.
- Reports can retain identifying metadata, and redaction can miss variants. Read the [privacy boundary](privacy.md) before sharing outputs.
