# Security policy

## Supported versions

Security fixes are made on `main` and released from there. Use the latest commit or the live site.

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** form on this repository. If private reporting is unavailable, open an issue that only asks for a private channel. Do not include exploit details, personal data or real files in public issues.

The project is maintained by [ufodia](https://github.com/ufodia), with no guaranteed response time. Please allow a reasonable investigation window before public disclosure.

## Processing boundary

Memory Mirror analyzes selected files in your browser, with no application upload endpoint or inference service. The production configuration uses `connect-src 'none'` to block scripted connection APIs; this does not block initial asset requests or external links you open. Imported content is rendered as text. The app does not persist the archive in browser storage, but does not guarantee secure memory erasure. Exported reports can contain identifying metadata and undetected details, so handle them as carefully as the original files. See the [privacy model](docs/privacy.md) for the full boundary.

## Scope

In scope: script injection through imported files, data leaving the browser, unsafe parsing that can freeze or crash the page, and supply-chain problems in the build. Out of scope: findings that require a compromised device or browser extension.
