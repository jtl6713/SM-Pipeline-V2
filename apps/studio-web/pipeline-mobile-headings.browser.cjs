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
            calendarHidden: getComputedStyle(document.querySelector('#pipelineScheduleOverview')).display === 'none',
            contentControls: ['#pipelineContentFrom', '#pipelineContentTo', '#pipelineContentSize', '#pipelineContentPrev', '#pipelineContentNext']
              .map(selector => {
                const element = document.querySelector(selector);
                if (!element) throw new Error('Missing Pipeline pagination control: ' + selector);
                const rect = element.getBoundingClientRect();
                return { selector, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
              }),
            defaultPageSize: document.querySelector('#pipelineContentSize').value,
            titleHeight: document.querySelector('.pipeline-page-heading h1').getBoundingClientRect().height,
          };
        });
        assert.equal(result.rowDisplay, 'table-row', `${name} ${width}: native heading row`);
        assert.ok(result.alignment && result.sameRow, `${name} ${width}: headings align with columns`);
        assert.ok(result.titleHeight > 0, `${name} ${width}: page title visible`);
        assert.ok(result.calendarHidden, `${name} ${width}: legacy weekly calendar hidden`);
        assert.equal(result.defaultPageSize, '10', `${name} ${width}: 10 content groups per page by default`);
        assert.ok(result.contentControls.every(rect =>
          rect.width > 0 && rect.height > 0 && rect.left >= -1 && rect.right <= width + 1),
          `${name} ${width}: content pagination and local-date controls stay within viewport`);
        console.log(`PASS ${name} ${width}px: title, headings, column alignment`);

        await page.evaluate(() => {
          document.querySelector('#page-outputs').classList.remove('active');
          document.querySelector('#page-ideas').classList.add('active');
        });
        const ideasLayout = await page.evaluate(() => {
          const heading = document.querySelector('#page-ideas .heading-actions');
          const selectors = {
            group: '#ideaGeneratePanel',
            count: '#ideaGenerateCount',
            quality: '#ideaGenerateQuality',
            generate: '#ideaGenerateSubmit',
          };
          // The current Ideas UI groups Quantity, Quality and Generate Ideas in a
          // single panel. The old standalone #generateIdeasButton was removed.
          const elements = Object.fromEntries(Object.entries(selectors)
            .map(([key, selector]) => [key, document.querySelector(selector)]));
          for (const [key, element] of Object.entries(elements)) {
            if (!element) throw new Error('Missing current Ideas generator element: ' + key);
          }
          const box = element => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
              width: rect.width, height: rect.height };
          };
          return {
            title: document.querySelector('#ideaGenerateHeading')?.textContent.trim(),
            actionCount: heading.querySelectorAll(':scope > button').length,
            group: box(elements.group),
            count: box(elements.count),
            quality: box(elements.quality),
            generate: box(elements.generate),
          };
        });
        assert.equal(ideasLayout.title, 'AI Idea Generation',
          name + ' ' + width + ': current generator panel heading');
        assert.equal(ideasLayout.actionCount, 4,
          name + ' ' + width + ': existing Ideas toolbar actions preserved');
        assert.ok(ideasLayout.group.width > 0 && ideasLayout.group.left >= -1 &&
          ideasLayout.group.right <= width + 1,
          name + ' ' + width + ': Ideas generator panel fits viewport');
        for (const field of ['count', 'quality', 'generate']) {
          const rect = ideasLayout[field];
          assert.ok(rect.width > 0 && rect.height > 0 &&
            rect.left >= ideasLayout.group.left - 1 &&
            rect.right <= ideasLayout.group.right + 1,
            name + ' ' + width + ': ' + field + ' is visible inside generation panel');
        }
        console.log('PASS ' + name + ' ' + width +
          'px: Ideas quantity, quality, and Generate button grouped and responsive');
        await page.close();
      }
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

