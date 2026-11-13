# Deployment

Memory Mirror is a static site: `npm run build` produces a `dist/` folder that a static host can serve. The production deployment is [memory-mirror-app.vercel.app](https://memory-mirror-app.vercel.app/). Reproduce the security headers below on any other host and verify the actual live response; the source configuration alone does not prove deployment behavior.

## Build

```bash
npm ci
npm run check   # strict typecheck, unit tests and production build into dist/
```

`postbuild` runs `scripts/prepare-hosting.mjs`, which only touches `dist/`:

- **Production on Vercel** (`VERCEL_ENV=production` and a valid public `VERCEL_PROJECT_PRODUCTION_URL` supplied by Vercel): adds a canonical URL and `og:url`, resolves the root-relative `og:image`, and prepares production indexing files when no explicit source policy blocks them.
- **Local and preview builds:** adds `noindex,nofollow` and, unless an explicit source robots file exists, a disallow-all `robots.txt`; no generated production sitemap is retained.
- **Explicit policies:** source robots metadata and a custom robots file are preserved. A pre-existing canonical tag or custom sitemap stops automatic preparation for a deliberate review, rather than silently overwriting it.

The production URL is derived from the deployment environment, not guessed from a branch or repository name. A non-Vercel host needs a reviewed equivalent build-time configuration for its intended production origin and indexing policy. Make durable changes in source and rebuild; do not rely on manual edits to disposable `dist/` output.

## Security headers

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |

`connect-src 'none'` blocks scripted connections such as `fetch`, XHR, WebSocket, EventSource and beacons. It does not prohibit all network activity: the site still loads allowed assets and external links can be opened by the user. `style-src 'unsafe-inline'` supports inline progress and meter styles; scripts remain restricted to the same origin.

## Vercel

[`vercel.json`](../vercel.json) pins the framework (Vite), install command (`npm ci`), build command (`npm run build`), output directory (`dist`) and all headers above. Node.js 24 is selected through `engines` in `package.json`. Deploy the reviewed GitHub `main` commit. No application secret or inference key is required; Vercel supplies the build-environment values used for production metadata.

## Netlify, Cloudflare Pages and others

Use `npm run build` as the build command and `dist` as the publish directory, then add the headers. For Netlify or Cloudflare Pages, create `public/_headers` before building:

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
```

The source has no export-upload or remote-analysis flow. Without the headers, the browser does not enforce the same scripted-connection restriction. Neither configuration protects against a compromised device, privileged extension or maliciously modified deployment; see the [privacy boundary](privacy.md).

## Verify a deployment

1. Open the site and check the page's response headers in your browser's developer tools.
2. Run the synthetic demo. Confirm that scanning does not upload its input; normal same-origin asset and worker requests are expected.
3. Run the browser suite against your URL:

```bash
PLAYWRIGHT_BASE_URL=https://your-deployment.example npx playwright test
```

For PowerShell:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'https://your-deployment.example'
npm run test:browser
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

Use synthetic inputs for deployment checks and screenshots. Do not upload personal export files to a CI job, issue, public repository or deployment log.
