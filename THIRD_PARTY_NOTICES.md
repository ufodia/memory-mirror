# Third-party notices

Memory Mirror's own source code, documentation and artwork are MIT-licensed © 2026 ufodia.

ChatGPT, Claude, Open WebUI and SillyTavern are names of independent products. They identify supported input formats; Memory Mirror is not affiliated with their owners or model providers. Rights to those names remain with their respective owners.

## Runtime dependency

| Component | Version | License | Use |
| --- | --- | --- | --- |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | MIT | Reading `.zip` export archives in the browser |

## Development tools

Vite, TypeScript, Vitest, Playwright and Prettier are used to build and test the project and are not shipped to users. Their licenses are available in `node_modules` after `npm ci`, and exact versions are pinned in `package-lock.json`.

## Test values

The synthetic demo uses public test values: the Stripe test card `4242 4242 4242 4242`, the ISO 13616 example IBAN `GB82 WEST 1234 5698 7654 32`, and invented names, addresses and keys. None of them belong to a real person or account.
