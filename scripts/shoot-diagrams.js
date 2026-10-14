// Screenshot diagram HTML files at 2x device scale (print quality) → PNG
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const jobs = [
    { html: 'scripts/flow-build.html', out: 'analysis/flow-build.png' },
    { html: 'scripts/flow-pipeline.html', out: 'analysis/flow-pipeline.png' },
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1240, height: 800 }, deviceScaleFactor: 2 });
  for (const j of jobs) {
    await page.goto('file://' + path.resolve(j.html));
    await page.waitForTimeout(300);
    const body = await page.locator('body');
    await body.screenshot({ path: j.out });
    console.log('saved', j.out);
  }
  await browser.close();
})();
