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

        await page.evaluate(() => {
          document.querySelector('#page-outputs').classList.remove('active');
          document.querySelector('#page-ideas').classList.add('active');
        });
        const ideasLayout = await page.evaluate(() => {
          const heading = document.querySelector('#page-ideas .heading-actions');
          const actions = [...heading.querySelectorAll(':scope > button')];
          const group = heading.querySelector('.idea-generate-top-action');
          const count = heading.querySelector('#ideaGenerateCount');
          const generate = heading.querySelector('#generateIdeasButton');
          const box = el => {
            const rect = el.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
          };
          return {
            actions: actions.map(box),
            group: box(group),
            count: box(count),
            generate: box(generate),
            columns: getComputedStyle(heading).gridTemplateColumns.split(' ').filter(Boolean).length,
            overflow: heading.scrollWidth > heading.clientWidth + 1,
          };
        });
        assert.equal(ideasLayout.actions.length, 4, name + ' ' + width + ': four normal Ideas actions');
        assert.equal(ideasLayout.columns, 2, name + ' ' + width + ': two complete Ideas action columns');
        assert.ok(Math.abs(ideasLayout.actions[0].top - ideasLayout.actions[1].top) < 2,
          name + ' ' + width + ': Refresh and unused photos share the first row');
        assert.ok(Math.abs(ideasLayout.actions[2].top - ideasLayout.actions[3].top) < 2,
          name + ' ' + width + ': VO timeline and New idea share the second row');
        assert.ok(Math.abs(ideasLayout.actions[0].width - ideasLayout.actions[1].width) < 2,
          name + ' ' + width + ': both columns have equal width');
        assert.ok(ideasLayout.actions.every(rect => rect.left >= 0 && rect.right <= width + 1),
          name + ' ' + width + ': all action tiles fit viewport');
        assert.ok(!ideasLayout.overflow, name + ' ' + width + ': no Ideas heading overflow');
        assert.ok(ideasLayout.generate.width < 200, name + ' ' + width + ': compact Generate button');
        assert.ok(ideasLayout.generate.left >= ideasLayout.count.right &&
          ideasLayout.generate.left - ideasLayout.count.right < 18,
          name + ' ' + width + ': Generate button immediately follows quantity');
        assert.ok(ideasLayout.group.left >= 0 && ideasLayout.group.right <= width + 1,
          name + ' ' + width + ': paired quantity and Generate fit viewport');
        console.log('PASS ' + name + ' ' + width + 'px: two Ideas columns, compact Generate action, no overflow');
        await page.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

