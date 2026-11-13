# Privacy model

Memory Mirror exists to reduce how widely your conversations are shared, so it must not become another place they leak. This page describes what the app does, what enforces it, and what remains your responsibility.

## Application boundary

| Behavior | Implementation and limits |
| --- | --- |
| Local analysis | There is no application endpoint for uploading an export and no remote inference call. The production site sends `Content-Security-Policy: connect-src 'none'`, which blocks `fetch`, `XMLHttpRequest`, WebSocket, EventSource and `navigator.sendBeacon` connections. This directive does not prevent all network activity: the site still loads its assets and can open links you choose. |
| Same-origin runtime assets | Scripts are bundled and served by the application host, with `script-src 'self'`. The app has no third-party fonts, analytics, embedded widgets or CDN scripts. The repository README's external badges and support-button image are not part of the app. |
| No persistent archive storage by the app | The parsed archive is held in a worker; the page receives report data. The app does not persist it in cookies, `localStorage`, `sessionStorage` or IndexedDB. Ending the review releases application references, but this is not secure memory erasure. |
| Masked review | Finding values are masked and context blurred until you reveal them. Titles, dates, source filenames and entered watch words can remain visible. Masking is neither encryption nor complete de-identification. |
| Text-only import rendering | Imported content is inserted as text nodes, not interpreted as HTML. The browser suite includes a hostile-markup regression case. |
| Deliberate downloads | The standard JSON masks finding values. The raw report adds real values and context after confirmation. All outputs can retain identifying content and need review before sharing. |

To inspect the boundary, load the synthetic demo and check the deployed document and worker response headers in your browser's developer tools. The initial page, scripts, styles and worker are normal same-origin requests. Scanning selected export contents should not produce an analysis upload. The hosting configuration must be checked on the actual deployed origin; a source file alone does not prove a live header is present.

Conversation links open ChatGPT in a separate tab when **you** choose them. Their URLs contain the conversation identifier. Clicking GitHub or Buy Me a Coffee opens an external service subject to its own policies. These visits are outside the local analysis boundary.

## Downloads and redaction

Treat every downloaded report as private until you inspect it:

- **Masked JSON** masks matched finding values and supplied watch words, but keeps conversation titles, source filenames, identifiers, links, timestamps and summary information. Those fields can identify people or reveal sensitive context.
- **Cleanup Markdown** includes conversation titles and links. Review ticks describe your review progress, not a verified deletion.
- **Redacted transcript** replaces eligible detected values using stable placeholders. Matching is case-sensitive and uses whole-word boundaries. Bare relation findings and one-character values are not substituted; undetected details, spelling variants and context can remain.
- **Raw JSON** contains real values and surrounding context. Protect it as carefully as the original archive.

Masking and redaction help you review text. They do not certify that a file is anonymous, safe for public release, or compliant with a particular policy.

## What Memory Mirror cannot protect

- **Your device.** Browser extensions with page access, malware, other users of the device or someone at your screen can inspect data. Browser and operating-system memory handling are outside the app's control.
- **Downloaded files.** Reports and redacted transcripts are saved to your device. Raw reports contain real values; treat them like the export itself.
- **Redaction gaps.** The redacted transcript replaces only what was detected. Read it before sharing.
- **Account-side retention.** Memory Mirror cannot inspect hidden model state, retrieve deleted text, delete chats or saved memories, change training controls, or verify the provider's deletion outcome. Review the current account controls separately.
- **The host.** Loading a hosted copy exposes ordinary connection metadata, such as your IP address and asset requests, to that host. No-export-upload does not mean an anonymous website visit. A modified or compromised deployment can differ from the reviewed source.
- **Self-hosting.** Vercel applies `vercel.json`; other hosts need equivalent headers. Vite development mode does not apply those production headers. Build locally, load the app's assets, and disconnect before opening files if you want a disconnected review.

## Reporting a problem

If you find a way to make the page send data anywhere, or to execute imported content, please report it privately as described in [SECURITY.md](../SECURITY.md).
