import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { readFile } from 'node:fs/promises';
import { DEMO_CHATGPT } from '../src/demo.ts';

async function loadDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try the synthetic demo' }).click();
  await expect(page.locator('.summary')).toBeVisible();
}

async function downloadText(page: Page, action: () => Promise<void>) {
  const wait = page.waitForEvent('download');
  await action();
  const download = await wait;
  return { name: download.suggestedFilename(), text: await readFile((await download.path())!, 'utf8') };
}

test('demo report: score, categories, privacy screen and reveal', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await loadDemo(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.score-label strong')).toHaveText(/\d+/);
  await expect(page.locator('.category-card')).toHaveCount(10);

  await page.getByRole('tab', { name: /Findings/ }).click();
  await expect(page.locator('.finding')).toHaveCount(31);
  // Masked by default: the raw card number is not shown anywhere as a value.
  await expect(page.locator('.value', { hasText: '4242 4242 4242 4242' })).toHaveCount(0);
  const card = page.locator('.finding', { hasText: 'Payment card number' });
  await card.locator('.value').click();
  await expect(page.locator('.finding', { hasText: 'Payment card number' }).locator('.value')).toHaveText(
    '4242 4242 4242 4242',
  );

  await page.getByRole('button', { name: /Government IDs/ }).click();
  await expect(page.locator('.finding')).toHaveCount(1);
  await page.getByRole('switch', { name: 'Privacy screen' }).click();
  await expect(page.locator('.finding .value')).toHaveText('X1234567');
  expect(errors).toEqual([]);
});

test('people and cleanup plan', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('tab', { name: /People/ }).click();
  await expect(page.locator('.person', { hasText: 'Daughter' })).toContainText('Child');
  await page.getByRole('tab', { name: /Cleanup plan/ }).click();
  const first = page.locator('.cleanup-row').first();
  await first.locator('input').check();
  await expect(page.locator('#reviewed-count')).toHaveText('1');
  const checklist = await downloadText(page, () =>
    page.getByRole('button', { name: 'Download checklist' }).click(),
  );
  expect(checklist.name).toBe('memory-mirror-cleanup.md');
  expect(checklist.text).toContain('- [x] ');
  await expect(page.locator('.cleanup-row a').first()).toHaveAttribute('href', /^https:\/\/chatgpt\.com\//);
});

test('exports are masked unless raw is chosen, and redaction replaces values', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('tab', { name: 'Export' }).click();
  const masked = await downloadText(page, () => page.getByRole('button', { name: 'Download JSON' }).click());
  const report = JSON.parse(masked.text);
  expect(report.valuesMasked).toBe(true);
  expect(masked.text).not.toContain('4242 4242 4242 4242');
  expect(masked.text).not.toContain('jordan.avery@example.com');

  const redacted = await downloadText(page, () =>
    page.getByRole('button', { name: 'Download Markdown' }).nth(1).click(),
  );
  expect(redacted.name).toBe('memory-mirror-redacted-transcript.md');
  expect(redacted.text).not.toContain('jordan.avery@example.com');
  expect(redacted.text).toMatch(/\[CONTACT_\d+\]/);

  page.once('dialog', (dialog) => void dialog.accept());
  const raw = await downloadText(page, () => page.getByRole('button', { name: 'Download raw JSON' }).click());
  expect(raw.text).toContain('4242 4242 4242 4242');
});

test('opens a real zip archive and rescans with watch words', async ({ page }) => {
  await page.goto('/');
  const zip = zipSync({
    'chatgpt-export/conversations.json': strToU8(JSON.stringify(DEMO_CHATGPT)),
    'chatgpt-export/chat.html': strToU8('<html></html>'),
  });
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'chatgpt-export.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await expect(page.locator('.summary')).toContainText('6 conversations');
  await page.getByLabel('Watch words, separated by commas').fill('marathon, Portland');
  await page.getByRole('button', { name: 'Rescan' }).click();
  await expect(page.locator('.category-card.cat-watchlist')).toBeVisible();
});

test('imported text is never executed as HTML', async ({ page }) => {
  await page.goto('/');
  const hostile = [
    {
      id: 'x1',
      title: '<img src=x onerror="window.__pwned=1">',
      create_time: 1767225600,
      mapping: {
        a: {
          message: {
            author: { role: 'user' },
            create_time: 1767225600,
            content: {
              content_type: 'text',
              parts: ['My email is <b>evil@example.com</b><script>window.__pwned=2</script>'],
            },
          },
        },
      },
    },
  ];
  await page.locator('#file-input').setInputFiles({
    name: 'conversations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(hostile)),
  });
  await page.getByRole('tab', { name: /Findings/ }).click();
  await expect(page.locator('.finding footer')).toContainText('<img src=x onerror="window.__pwned=1">');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
});

test('explains unsupported files and works on a phone', async ({ page }) => {
  await page.goto('/');
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.locator('#intro-error')).toContainText('not a recognized ChatGPT');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Try the synthetic demo' }).click();
  await expect(page.locator('.summary')).toBeVisible();
  for (const name of [/Overview/, /Findings/, /People/, /Cleanup plan/, 'Export']) {
    await page.getByRole('tab', { name }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
      true,
    );
  }
});

test('privacy controls, rescan and reset clear previous reveal and review state', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage;
    (window as unknown as { rescans: number }).rescans = 0;
    Worker.prototype.postMessage = function (message, transfer) {
      if (message?.type === 'rescan') (window as unknown as { rescans: number }).rescans++;
      original.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
    };
  });
  await loadDemo(page);
  await page.getByRole('tab', { name: /Findings/ }).click();
  await expect(page.getByRole('tab', { name: /Findings/ })).toBeFocused();
  const card = page.locator('.finding', { hasText: 'Payment card number' });
  await card.locator('.value').click();
  await expect(card.locator('.value')).toHaveText('4242 4242 4242 4242');
  await page.getByRole('switch', { name: 'Privacy screen' }).click();
  await card.locator('.value').click();
  await expect(card.locator('.value')).not.toHaveText('4242 4242 4242 4242');
  await page.getByRole('switch', { name: 'Privacy screen' }).click();
  await expect(page.locator('.finding .value.open')).toHaveCount(0);

  await page.getByRole('tab', { name: /Cleanup plan/ }).click();
  await page.locator('.cleanup-row input').first().check();
  await page.getByRole('switch', { name: 'Privacy screen' }).click();
  await page.getByLabel('Watch words, separated by commas').fill('marathon');
  await page.getByLabel('Watch words, separated by commas').press('Enter');
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.locator('#reviewed-count')).toHaveText('0');
  await expect(page.getByRole('switch', { name: 'Privacy screen' })).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => (window as unknown as { rescans: number }).rescans)).toBe(1);

  await page.getByRole('tab', { name: /Cleanup plan/ }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Export' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: /Overview/ })).toBeFocused();

  await page.getByRole('button', { name: 'Scan another export' }).click();
  await page.getByRole('button', { name: 'Try the synthetic demo' }).click();
  await expect(page.locator('.summary')).toBeVisible();
  await expect(page.getByLabel('Watch words, separated by commas')).toHaveValue('');
  await expect(page.getByRole('switch', { name: 'Privacy screen' })).toHaveAttribute('aria-checked', 'true');
});

test('checks file size before reading and recovers from an unreadable selection', async ({ page }) => {
  await page.addInitScript(() => {
    const original = File.prototype.arrayBuffer;
    const size = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')!.get!;
    (window as unknown as { oversizedRead: boolean }).oversizedRead = false;
    Object.defineProperty(File.prototype, 'size', {
      get() {
        return this.name === 'oversized.txt' ? 1_500_000_001 : size.call(this);
      },
    });
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'oversized.txt') {
        (window as unknown as { oversizedRead: boolean }).oversizedRead = true;
        throw new Error('Oversized file should not be read');
      }
      if (this.name === 'unreadable.txt') throw new DOMException('Read failed', 'NotReadableError');
      return original.call(this);
    };
  });
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'oversized.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Small fixture with an oversized reported file length'),
  });
  await expect(page.locator('#intro-error')).toContainText('larger than 1.5 GB');
  expect(await page.evaluate(() => (window as unknown as { oversizedRead: boolean }).oversizedRead)).toBe(
    false,
  );
  await page.locator('#file-input').setInputFiles({
    name: 'unreadable.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('My email is unreadable@example.com'),
  });
  await expect(page.locator('#intro-error')).toContainText('A selected file could not be read');
  await page.getByRole('button', { name: 'Try the synthetic demo' }).click();
  await expect(page.locator('.summary')).toBeVisible();
});

test('a slower old file selection cannot replace the latest import', async ({ page }) => {
  await page.addInitScript(() => {
    type ImportProbe = { finishSlow?: () => void; slowFinished: boolean; scannedFiles: string[] };
    const probe = window as unknown as ImportProbe;
    probe.slowFinished = false;
    probe.scannedFiles = [];
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name === 'slow.txt') await new Promise<void>((resolve) => (probe.finishSlow = resolve));
      const bytes = await read.call(this);
      if (this.name === 'slow.txt') probe.slowFinished = true;
      return bytes;
    };
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, transfer) {
      if (message?.type === 'scan')
        probe.scannedFiles.push(...message.files.map((file: { name: string }) => file.name));
      post.call(this, message, Array.isArray(transfer) ? { transfer } : transfer);
    };
  });
  await page.goto('/');
  await page.locator('#file-input').setInputFiles({
    name: 'slow.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('My email is stale@example.com'),
  });
  await page.waitForFunction(
    () => typeof (window as unknown as { finishSlow?: () => void }).finishSlow === 'function',
  );
  await page.locator('#file-input').setInputFiles({
    name: 'fast.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('My email is current@example.com'),
  });
  await expect(page.locator('.summary')).toBeVisible();
  await page.evaluate(() => (window as unknown as { finishSlow: () => void }).finishSlow());
  await page.waitForFunction(() => (window as unknown as { slowFinished: boolean }).slowFinished);
  expect(await page.evaluate(() => (window as unknown as { scannedFiles: string[] }).scannedFiles)).toEqual([
    'fast.txt',
  ]);
  await page.getByRole('tab', { name: /Findings/ }).click();
  await page.locator('.finding .value').click();
  await expect(page.locator('.finding .value')).toHaveText('current@example.com');
});

test('cleanup pagination keeps every conversation reviewable on a narrow screen', async ({ page }) => {
  await page.goto('/');
  const conversations = Array.from({ length: 152 }, (_, index) => ({
    id: `chat-${index}`,
    title: index === 0 ? 'UnbrokenTitle'.repeat(35) : `Conversation ${index}`,
    mapping: {
      message: {
        message: {
          author: { role: 'user' },
          content: { content_type: 'text', parts: [`My email is person${index}@example.com`] },
        },
      },
    },
  }));
  await page.locator('#file-input').setInputFiles({
    name: 'conversations.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(conversations)),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /Cleanup plan/ }).click();
  await expect(page.locator('.cleanup-row')).toHaveCount(150);
  await page.locator('.cleanup-row input').first().check();
  await page.getByRole('button', { name: 'Show 2 more conversations' }).click();
  await expect(page.locator('.cleanup-row')).toHaveCount(152);
  await expect(page.locator('#reviewed-count')).toHaveText('1');
  await expect(page.locator('.cleanup-row input').nth(150)).toBeFocused();
  expect(
    await page
      .locator('.cleanup-main')
      .first()
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
});
