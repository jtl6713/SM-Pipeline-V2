// Read-only layout regression: real Studio HTML/CSS, no API calls or production data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link[^>]*href="\/assets\/([^"?]+)[^>]*>/g, (_, file) =>
    '<style>' + fs.readFileSync(path.join(root, 'assets', file), 'utf8') + '</style>');
(async () => {
  const engines = process.env.STUDIO_LAYOUT_CHROMIUM_ONLY === '1' ? { chromium } : { chromium, webkit };
  for (const [name, engine] of Object.entries(engines)) {
    const browser = await engine.launch({ headless: true });
    try {
      for (const width of [375, 390, 430, 768, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 844 } });
        await page.route('**/*', route => route.abort());
        await page.setContent(html);
        const profile = page.locator('#studioProfileSelect');
        assert.ok(await profile.isVisible(), `${name} ${width}: profile selector visible before JavaScript`);
        const profileBox = await profile.boundingBox();
        assert.ok(profileBox.x >= 0 && profileBox.x + profileBox.width <= width, `${name} ${width}: profile fits viewport`);
        await page.evaluate(() => {
          document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
          document.querySelector('#page-outputs').classList.add('active');
          document.querySelector('#outputsList').innerHTML = '<table class="data-table pipeline-compact-table"><thead><tr>' +
            ['Content', 'Platform', 'Status', 'Progress', 'Schedule (your time)', 'Actions'].map(s => '<th>' + s + '</th>').join('') +
            '</tr></thead><tbody><tr>' + Array(6).fill('<td>Output</td>').join('') + '</tr></tbody></table>';
        });
        const result = await page.evaluate(() => {
          const table = document.querySelector('.pipeline-compact-table');
          const headers = [...table.querySelectorAll('th')];
          const cells = [...table.querySelectorAll('td')];
          return {
            rowDisplay: getComputedStyle(table.querySelector('thead tr')).display,
            alignment: headers.every((h, i) => Math.abs(h.getBoundingClientRect().x - cells[i].getBoundingClientRect().x) < 1),
            sameRow: headers.every(h => Math.abs(h.getBoundingClientRect().y - headers[0].getBoundingClientRect().y) < 1),
            calendarHeading: getComputedStyle(document.querySelector('.pipeline-schedule-overview-heading h2')).display,
            titleHeight: document.querySelector('.pipeline-page-heading h1').getBoundingClientRect().height,
          };
        });
        assert.equal(result.rowDisplay, 'table-row', `${name} ${width}: native heading row`);
        assert.ok(result.alignment && result.sameRow, `${name} ${width}: headings align with columns`);
        assert.ok(result.titleHeight > 0, `${name} ${width}: page title visible`);
        if (width <= 760) assert.notEqual(result.calendarHeading, 'none', `${name} ${width}: calendar heading visible`);
        console.log(`PASS ${name} ${width}px: title, headings, column alignment`);
        await page.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

