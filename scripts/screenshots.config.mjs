/** Screens captured for the README. Every image shows the synthetic demo, never real data. */
const demo = async (page) => {
  await page.getByRole('button', { name: 'Try the synthetic demo' }).click();
  await page.locator('.summary').waitFor();
};

export default {
  shots: [
    {
      file: 'docs/assets/screenshot-home.png',
      viewport: { width: 1360, height: 900 },
      prepare: async () => {},
    },
    { file: 'docs/assets/screenshot-overview.png', viewport: { width: 1360, height: 1180 }, prepare: demo },
    {
      file: 'docs/assets/screenshot-findings.png',
      viewport: { width: 1360, height: 1000 },
      prepare: async (page) => {
        await demo(page);
        await page.getByRole('tab', { name: /Findings/ }).click();
        await page.locator('.finding').first().locator('.value').click();
        await page
          .locator('.tabs')
          .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
      },
    },
    {
      file: 'docs/assets/screenshot-cleanup.png',
      viewport: { width: 1360, height: 900 },
      prepare: async (page) => {
        await demo(page);
        await page.getByRole('tab', { name: /Cleanup plan/ }).click();
        await page.locator('.cleanup-row input').nth(1).check();
        await page
          .locator('.tabs')
          .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 16));
      },
    },
    {
      file: 'docs/assets/screenshot-mobile.png',
      viewport: { width: 390, height: 844 },
      scale: 2,
      prepare: demo,
    },
  ],
  cards: [{ source: 'docs/assets/social-card.svg', file: 'public/og-image.png', width: 1200, height: 630 }],
};
