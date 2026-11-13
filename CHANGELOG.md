# Changelog

All notable changes to Memory Mirror are documented here. The project follows [Semantic Versioning](https://semver.org/).

## 1.0.0 — 2026-11-13

First public release.

### Added

- In-browser review of ChatGPT and Claude export archives, native Open WebUI JSON, direct SillyTavern JSONL/NDJSON, normalized role/content JSON, supplied memory JSON, and text or Markdown, with selective ZIP decompression and explicit input ceilings.
- Ordered detectors across 11 categories, including checksum-based card, IBAN and Turkish ID validation, US SSN shape checks, API keys and tokens, and first-person health, money, legal and sensitive-context rules.
- Third-person rules for saved memories and custom instructions.
- Exposure score with logarithmic category weighting.
- Overview, findings, people, cleanup plan and export views with a privacy screen, per-value reveal, filters and search.
- Masked JSON with masked watch words, explicit raw JSON downloads, a Markdown cleanup checklist and redacted transcripts with stable placeholders for eligible exact matches.
- Independent watch-word annotations that do not suppress overlapping built-in credential findings, plus optional scanning of assistant replies.
- Web Worker processing with request identifiers for stale-response protection.
- Strict Content-Security-Policy with `connect-src 'none'` on the production site.
- Synthetic demo inputs, unit tests, Playwright browser tests, CI and illustrated documentation with explicit privacy and detection limits.
