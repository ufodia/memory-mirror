# User guide

## 1. Request your export

| Assistant | Steps | Arrives as |
| --- | --- | --- |
| ChatGPT | Eligible accounts: **Settings → Data controls → Export data**, then confirm; see [OpenAI's current guide](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data) | The supported export archive or conversation JSON |
| Claude | On the web or Claude Desktop: **Settings → Privacy → Export data**; see [the current official guide](https://support.claude.com/en/articles/9450526-export-your-claude-data) for eligibility | The supported export archive or conversation JSON |
| Open WebUI | Use the JSON export described in its [official data-controls guide](https://github.com/open-webui/docs/blob/main/docs/features/chat-conversations/data-controls/import-export.md) | The native JSON file, opened directly |
| SillyTavern | Export a chat as JSONL; see [the official chat-file guide](https://docs.sillytavern.app/usage/core-concepts/chatfilemanagement/) | The `.jsonl` or `.ndjson` file, opened directly |
| Other chat tools | Convert locally to the documented role/content contract, or supply a text copy | Supported normalized `.json`, `.txt` or `.md` |

Export availability, delivery and contents can vary by account and product changes. Organization-managed accounts may need an owner to enable or provide access. The current Claude export workflow is on web or desktop, not its mobile apps. Memory Mirror does not request an export for you or sign in to either account. Save the file you receive; you can open a supported archive without unzipping it first.

To include **saved memories**, copy the entries you choose from your memory settings into a plain text file such as `memories.txt`, then open it with the export. The app cannot retrieve memories that are absent from your supplied files.

## 2. Open it

Drop the files on the page, or choose **Choose files**. You can open several supported files at once, such as ChatGPT and Claude archives plus a copied memories file. They are combined into one report. Overlapping inputs are not automatically deduplicated, so avoid selecting both an archive and the same JSON extracted from it.

### Supported inputs

- the export `.zip` (only entries with supported conversation or memory JSON filenames are decompressed),
- supported ChatGPT or Claude conversation JSON, or `memories.json` on its own,
- supported native Open WebUI JSON,
- direct SillyTavern JSONL/NDJSON chat files,
- normalized role/content JSON matching the [documented contract](input-formats.md#normalized-rolecontent-json),
- `.txt` or `.md` files, read as text you wrote.

The [compatibility guide](input-formats.md) contains exact shapes and synthetic examples. A file can be valid JSON without matching a supported chat structure. Native Gemini, Grok, DeepSeek, Copilot and Mistral export formats are not claimed as supported; use a supported frontend or normalization rather than relying on the provider name.

Want to see the app first? Choose **Try the synthetic demo**. Every name, number and key in the demo is invented or a public test value.

### Input limits

The interface rejects selected inputs above **1,500,000,000 bytes in total**. The ZIP reader allows at most **1,500,000,000 uncompressed bytes per selected JSON entry** and **2,000,000,000 across selected entries**. These are validation ceilings, not a promise that a device can process files that large.

Decompression, text decoding, JSON objects and reports all need additional memory. A substantially smaller file can exhaust a phone or a constrained browser tab. Use a desktop browser for large histories, and consider opening the relevant conversation JSON directly. Corrupt or unsupported archives produce an error rather than a report.

Direct JSONL/NDJSON also has a 4,000,000-UTF-16-code-unit line ceiling and a 100,000-nonblank-record ceiling, including an optional metadata header. See [JSONL details](input-formats.md#sillytavern-jsonl--ndjson) before opening large chat files.

## 3. Read the overview

- **Exposure score** — a 0–100 summary of how much sensitive detail the scanned text contains, weighted by category. See [scoring](detection.md#scoring).
- **Counts** — messages and words you wrote, unique sensitive items, and other people mentioned.
- **Category cards** — what was found in each category, ordered by contribution to the score. **See all findings** opens the filtered list.
- **Timeline** — when the findings were written, by month.

The **privacy screen** switch masks finding values and blurs context. It does not hide conversation titles, source filenames, dates or watch words you enter. Turn it off only when you intend to reveal the findings; masking is not encryption.

## 4. Review findings

Each card shows the detector, the category, the masked value in context, the conversation it came from, the date, and whether you wrote it, it came from an attachment, a memory or custom instructions.

- Click a value to reveal or hide just that one.
- Filter by category with the chips, search by text, or tick **High confidence only**.
- Click a linked conversation title to open it in ChatGPT or Claude, according to its source. Open WebUI, SillyTavern and normalized/text inputs have no guessed account-side link; locate those conversations manually in their source app.

## 5. Check other people

The **People** tab groups detected relationship mentions, with matched names and counts. A child-related age pattern is marked **Child**. These are pattern matches, not a verified directory of everyone discussed or proof that a relationship is real.

## 6. Make a cleanup plan

**Cleanup plan** lists conversations from most to least revealing. For each one:

1. Open it with the link (it opens in the assistant's own app).
2. Decide whether you still need it, and delete it there if not.
3. Tick the box to mark it reviewed.

**Download checklist** saves the plan as Markdown, including your ticks. The app does not reload those ticks later. They describe review progress only and cannot verify that a chat or memory was deleted.

## 7. Export

| Export | Contents | Review before sharing |
| --- | --- | --- |
| Masked report (JSON) | Statistics, categories, masked values and watch words, conversations and timeline | Review first: titles, source filenames, dates, links and IDs can remain identifying |
| Cleanup checklist (Markdown) | Ranked conversations with links, categories and your review ticks | Review first: titles and links are included |
| Redacted transcript (Markdown) | Eligible detected values replaced by placeholders such as `[PERSON_1]` | Review all text: undetected details and case or spelling variants can remain |
| Raw report (JSON) | Real values and their context | No — treat it like the export |

The raw report needs an explicit confirmation. The standard report omits finding context and masks detected values; it is not an anonymity guarantee. Read the [download and redaction boundary](privacy.md#downloads-and-redaction) before sharing any output.

## 8. Tune and rescan

- **Also scan assistant replies** adds the assistant's messages to the scan.
- **Watch words** are whole-word terms to look for in the selected scan, such as a child's name, a street, or a project codename. Separate them with commas and press **Rescan**. The input itself is visible on screen.

## Troubleshooting

| Message | What to do |
| --- | --- |
| *does not contain conversations.json* | You dropped a different archive. Use the export from the assistant, or open its `conversations.json` directly. |
| *not a recognized export* | The JSON has an unexpected shape. Open an issue with a synthetic example of the structure (no real content). |
| A JSONL line error | Check that each nonblank line is one valid JSON object and that message records have the required role flags and `mes` string. Use the filename and line number; never post a real message publicly. |
| A file imports, but expected text is absent | Check the supported content fields and roles in [input formats](input-formats.md). Images, swipe alternatives, unsupported objects and system/tool text are not analyzed. |
| *larger than 1.5 GB* / *too large for this browser tab* | Open `conversations.json` on its own, or use a desktop browser with more memory. |
| No findings | Try watch words or include assistant replies. Indirect wording is not detected — see [limitations](detection.md#what-it-cannot-detect). |

To end the review, choose **Scan another export**, reload, or close the tab. The app does not persist the archive or review state. Downloaded files and the original export stay on your device; ending the session is not secure memory erasure.
