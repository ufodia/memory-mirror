# Contributing to Memory Mirror

Thanks for helping. Small, well-tested improvements are the most valuable contributions.

[ufodia](https://github.com/ufodia) is the creator, maintainer and only current contributor. External contributions are welcome through pull requests; this guide does not imply that other contributors have already participated.

## Set up

```bash
git clone https://github.com/ufodia/memory-mirror.git
cd memory-mirror
npm ci
npm run dev
```

Use Node.js 24. Before opening a pull request run:

```bash
npm run format:check
npm run check          # typecheck, unit tests, production build
npx playwright install chromium
npm run test:browser   # real browser workflow
```

## Good first contributions

- A synthetic fixture that produces a false positive or a missed finding, with a failing test.
- Documentation fixes, clearer error messages, keyboard and screen-reader improvements.
- Performance improvements with a before/after measurement.

## Pull requests

1. Branch from `main` and keep the change focused.
2. Add or update tests for behavior changes.
3. Update the README or `docs/` when user-visible behavior changes.
4. Fill in the pull request template, including the checks you ran.

Do not add analytics, remote inference, export uploads or tracking. Preserve local processing and make any change to its trust boundary explicit in the review. Once the application's assets are loaded, the review must work without an analysis service.

## Fixtures and privacy

Use invented names, numbers and images that you created yourself. Never commit personal data, client files or credentials. See [SECURITY.md](SECURITY.md) for vulnerability reports and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for community expectations.
