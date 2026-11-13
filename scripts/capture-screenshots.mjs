/**
 * Regenerates the README screenshots and the social preview image from the
 * real production build. Run `npm run build` first, then `npm run screenshots`.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import config from './screenshots.config.mjs';

const root = path.resolve(import.meta.dirname, '..');
const port = 4319;
const base = `http://127.0.0.1:${port}/`;

const server = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  {
    cwd: root,
    stdio: 'ignore',
  },
);

try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not ready yet */
    }
    await delay(250);
  }
  const browser = await chromium.launch({ channel: 'chromium' });
  for (const shot of config.shots) {
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.scale ?? 1,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(base);
    await shot.prepare(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(root, shot.file), fullPage: shot.fullPage ?? false });
    console.log(`Saved ${shot.file}`);
    await context.close();
  }
  for (const card of config.cards ?? []) {
    const page = await browser.newPage({ viewport: { width: card.width, height: card.height } });
    const svg = await readFile(path.join(root, card.source), 'utf8');
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">${svg}</body></html>`);
    await page.screenshot({ path: path.join(root, card.file) });
    console.log(`Saved ${card.file}`);
    await page.close();
  }
  await browser.close();
} finally {
  if (process.platform === 'win32')
    spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  else server.kill();
}
