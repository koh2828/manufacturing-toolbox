/* Real Chromium UI, existing synthetic samples only; no production writes. */
const { chromium } = require(process.env.TOOLBOX_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const crypto = require('node:crypto'), { execFileSync } = require('node:child_process');
const XLSX = require('../dist/vendor/xlsx.full.min.js');
const repo = path.resolve(__dirname, '..');
const url = (process.env.TOOLBOX_URL || 'http://127.0.0.1:8770/Launch.html').replace(/#.*$/, '');
const out = path.resolve(process.env.TOOLBOX_TEST_OUTPUT || path.join(repo, 'artifacts/ui-review'));
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', acceptDownloads: true });
  const p = await context.newPage(), errors = [], requests = [], screenshots = [], contrast = [];
  let checks = 0, postLoad = false, loadedLaunchSHA256;
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  const check = (ok, label) => { assert.ok(ok, label); checks++; console.log('PASS', label); };
  p.on('pageerror', error => errors.push(error.message));
  p.on('dialog', dialog => dialog.accept());
  context.on('request', request => {
    if (/^https?:/.test(request.url())) requests.push({ url: request.url(), method: request.method(), body: request.postData(), afterLoad: postLoad });
  });
  const nav = async tool => { await p.evaluate(tool => navigate(tool), tool); await p.waitForFunction(tool => state.view === tool, tool); };
  const theme = async value => {
    await p.locator('#theme-select').selectOption(value);
    await p.waitForFunction(value => ToolboxTheme.preference === value, value);
    // Review the settled UI, not a frame inside the existing 150ms hover/color transition.
    await p.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
  };
  const language = async value => { await p.locator(`[data-language="${value}"]`).click(); };
  const shot = async (name, fullPage = false) => {
    const file = `${name}.png`;
    await p.waitForFunction(() => getComputedStyle(document.querySelector('#toast')).display === 'none', null, { timeout: 6000 });
    await p.screenshot({ path: path.join(out, file), fullPage });
    screenshots.push({ file, viewport: p.viewportSize(), fullPage, route: await p.evaluate(() => state.view), language: await p.locator('html').getAttribute('lang'), theme: await p.locator('html').getAttribute('data-theme') });
  };
  const noOverflow = async label => {
    const dimensions = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    check(dimensions.scroll <= dimensions.width + 1, `${label}: no whole-page horizontal overflow (${dimensions.scroll}/${dimensions.width})`);
  };
  const readable = async (selector, label) => {
    const result = await p.locator(selector).first().evaluate(el => {
      const rgb = color => (color.match(/[\d.]+/g) || []).map(Number);
      const luminance = values => values.slice(0, 3).reduce((sum, channel, i) => { const s = channel / 255; return sum + (s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i]; }, 0);
      let background = [255, 255, 255], node = el;
      while (node) { const value = rgb(getComputedStyle(node).backgroundColor); if (value.length >= 3 && (value.length < 4 || value[3] === 1)) { background = value; break; } node = node.parentElement; }
      const style = getComputedStyle(el), foreground = rgb(style.color), a = luminance(foreground), b = luminance(background);
      return { color: style.color, background, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), font: style.fontSize };
    });
    contrast.push({ selector, label, ...result });
    check(result.ratio >= 4.5, `${label}: text contrast >= 4.5:1 (${result.ratio.toFixed(2)})`);
  };
  const stateSnapshot = () => p.evaluate(() => JSON.stringify({ data: state.data, raw: state.raw, col: state.col, lsl: state.lsl, usl: state.usl, quality: state.quality, qualityView: state.qualityView, result: state.result, cycleData: state.cycleData, cycleColumns: state.cycleColumns, cycleSettings: state.cycleSettings, cycleResult: state.cycleResult, paretoData: state.paretoData, paretoCategory: state.paretoCategory, paretoValue: state.paretoValue, rci: state.rci, dirty, workflows: state.workflows, cleanData: state.cleanData, cleanEdits: state.cleanEdits, cleanReviewed: state.cleanReviewed }));

  try {
    const initialResponse = await p.goto(url + '#home'); loadedLaunchSHA256 = hash(await initialResponse.body());
    await p.waitForFunction(() => typeof ToolboxTheme !== 'undefined' && typeof state !== 'undefined'); postLoad = true;
    check(await p.locator('#theme-select').inputValue() === 'system', 'first visit defaults to System');
    check(await p.locator('html').getAttribute('data-theme') === 'light', 'System initially follows light OS');
    await p.emulateMedia({ colorScheme: 'dark' });
    await p.waitForFunction(() => ToolboxTheme.resolved === 'dark'); check(true, 'System follows OS change without reload');
    await theme('light'); await p.emulateMedia({ colorScheme: 'light' }); await p.emulateMedia({ colorScheme: 'dark' });
    check(await p.locator('html').getAttribute('data-theme') === 'light', 'explicit Light is not overridden by dark OS');
    await theme('dark'); await p.emulateMedia({ colorScheme: 'light' });
    check(await p.locator('html').getAttribute('data-theme') === 'dark', 'explicit Dark is not overridden by light OS');
    check(await p.evaluate(() => localStorage.getItem(ToolboxTheme.KEY)) === 'dark', 'theme preference persists separately');
    postLoad = false; const reloadResponse = await p.reload(); loadedLaunchSHA256 = hash(await reloadResponse.body());
    await p.waitForFunction(() => typeof state !== 'undefined'); postLoad = true;
    check(await p.locator('#theme-select').inputValue() === 'dark' && await p.locator('html').getAttribute('data-theme') === 'dark', 'stored Dark restores after reload');
    await p.evaluate(() => { window.__themeNoReload = 'still here'; });

    const exactJa = ['Manufacturing Tools', '製造の道具箱', 'Less Excel. More Engineering.', '製造エンジニアの仕事を、もっとシンプルに。', '品質解析、工程改善、原因調査、検査データの整理まで。日々の面倒な作業を、もっと簡単にするWebツール。'];
    await language('ja'); await nav('home');
    const jaText = await p.locator('body').innerText();
    for (const text of exactJa) check(jaText.includes(text), `exact Japanese home copy: ${text}`);
    check(await p.title() === 'Manufacturing Tools｜製造の道具箱', 'Japanese browser title uses the new brand');
    check(!jaText.includes('Manufacturing Toolbox'), 'old service name is absent from visible Japanese home');
    check(await p.locator('.release-intro').isVisible() && await p.locator('#release-quality-sample').isVisible(), 'beta guidance and sample entry remain available');
    for (const value of ['light', 'dark']) {
      await theme(value);
      await readable('.tool-card h2', `${value} home card heading`);
      await readable('.tool-card p', `${value} home card description`);
      await readable('#release-quality-sample', `${value} home sample CTA`);
      await shot(`01-home-ja-${value}-desktop`, true);
    }
    await language('en');
    check(await p.locator('body').innerText().then(text => text.includes('Manufacturing Tools') && text.includes('Less Excel. More Engineering.') && text.includes('Simplify everyday work for manufacturing engineers.')), 'English home uses the new brand and natural headline');
    check(await p.locator('#theme-select').locator('option').allTextContents().then(labels => ['Light', 'Dark', 'System'].every(label => labels.includes(label))), 'English theme choices are translated');
    for (const value of ['light', 'dark']) { await theme(value); await shot(`02-home-en-${value}-desktop`, true); }
    await language('ja');
    check(await p.locator('#theme-select').locator('option').allTextContents().then(labels => ['ライト', 'ダーク', 'システムに合わせる'].every(label => labels.includes(label))), 'Japanese theme choices are translated');

    await p.locator('#release-quality-sample').click();
    check(await p.evaluate(() => state.result.n > 0 && state.data.isDemo), 'home sample opens populated capability results');
    await p.locator('#data-file').setInputFiles(path.join(repo, 'demo-data/A-experience/D01/D01A_inspection.xlsx'));
    await p.waitForFunction(() => state.data.name === 'D01A_inspection.xlsx' && state.result?.n === 40);
    check(await p.evaluate(() => state.data.rows[0][state.quality.lot]) === '000123', 'existing synthetic Excel fixture imports with text Lot IDs');
    await p.locator('#lsl').fill('95'); await p.locator('#usl').fill('110');
    await p.locator('#qc-start-date').fill('2026-09-05'); await p.locator('#qc-start-date').dispatchEvent('change');
    await p.locator('[data-chart-focus="mr"]').click();
    const qualityBefore = await stateSnapshot();
    await p.evaluate(() => { window.__themeResult = state.result; window.__themeWorkspace = document.querySelector('#workspace').firstElementChild; });
    await theme('light'); const lightAxis = await p.locator('#quality-plots .axis-label').first().evaluate(el => getComputedStyle(el).fill);
    await readable('.stat.featured summary[aria-label="Cpkの計算方法"]', 'light Cpk help button');
    await readable('.stat.featured summary[aria-label="Cpの計算方法"]', 'light Cp help button');
    await theme('dark'); const darkAxis = await p.locator('#quality-plots .axis-label').first().evaluate(el => getComputedStyle(el).fill);
    await readable('.stat.featured summary[aria-label="Cpkの計算方法"]', 'dark Cpk help button');
    await readable('.stat.featured summary[aria-label="Cpの計算方法"]', 'dark Cp help button');
    check(lightAxis !== darkAxis, 'chart axis text follows theme');
    check(await stateSnapshot() === qualityBefore, 'theme switching preserves data, mapping, specifications, filters, range and results');
    check(await p.evaluate(() => state.result === window.__themeResult && document.querySelector('#workspace').firstElementChild === window.__themeWorkspace), 'theme does not recalculate results or rebuild the workspace');
    check(await p.locator('.expanded-chart').getAttribute('data-quality-chart') === 'mr', 'expanded chart selection survives theme change');
    await p.locator('#qc-range-reset').click(); await p.locator('[data-chart-focus="individuals"]').click();
    for (const value of ['light', 'dark']) { await theme(value); await p.locator('[data-quality-chart="individuals"]').evaluate(el => el.scrollIntoView({ block: 'start' })); await shot(`03-capability-${value}-desktop`); }
    await p.locator('.stat.featured .formula-tip > summary').first().click();
    await readable('.stat.featured .formula-tip[open] > div', 'dark Cpk tooltip');
    await shot('04-capability-tooltip-dark'); await p.locator('.stat.featured .formula-tip > summary').first().click();

    await theme('system'); await p.emulateMedia({ colorScheme: 'light' });
    await p.locator('#paste-open').click(); await p.locator('#paste-text').fill('Lot,Value\nSYNTHETIC-UNSAVED,12.3');
    await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForFunction(() => ToolboxTheme.resolved === 'dark');
    check(await p.locator('#paste-dialog').isVisible() && await p.locator('#paste-text').inputValue() === 'Lot,Value\nSYNTHETIC-UNSAVED,12.3', 'OS theme change preserves open modal and unsaved input');
    await readable('#paste-text', 'dark modal input'); await shot('05-paste-modal-dark'); await p.keyboard.press('Escape');

    for (const tool of ['cycle', 'pareto', 'clean']) { await nav(tool); await p.locator('#demo').click(); }
    await nav('rci'); await p.locator('#rci-demo').click(); await p.locator('#rci-title').fill('Synthetic owner review — unsaved draft');
    await p.locator('#rci-impact').fill('Synthetic evidence retained during appearance changes.');
    const rciBefore = await stateSnapshot(); await theme('light'); await theme('dark');
    check(await stateSnapshot() === rciBefore && await p.locator('#rci-title').inputValue() === 'Synthetic owner review — unsaved draft', 'RCI draft and unsaved-work state survive theme changes');
    await p.locator('#rci-title').scrollIntoViewIfNeeded(); await shot('06-rci-draft-dark');

    for (const tool of ['recurring', 'batch']) {
      await nav(tool); await p.locator('#wf-sample').click(); await p.locator('#wf-analyze').click();
      await p.waitForFunction(() => wfState().result && !wfState().busy);
      check(await p.locator('#wf-results table').count() > 0, `${tool}: existing sample produces populated tables`);
    }
    await nav('recurring'); await p.locator('#wf-product').fill('DEMO-A'); await p.locator('#wf-product').dispatchEvent('change');
    await p.locator('#wf-analyze').click(); await p.waitForFunction(() => wfState().result && !wfState().busy);
    const workflowBefore = await stateSnapshot(); await theme('light'); await theme('dark');
    check(await stateSnapshot() === workflowBefore && await p.locator('#wf-product').inputValue() === 'DEMO-A', 'workflow sources, mappings, results and product filter survive theme changes');
    await p.locator('#wf-product').fill(''); await p.locator('#wf-product').dispatchEvent('change'); await p.locator('#wf-analyze').click(); await p.waitForFunction(() => wfState().result && !wfState().busy);
    for (const value of ['light', 'dark']) { await theme(value); await p.locator('#wf-results').scrollIntoViewIfNeeded(); await shot(`07-recurring-results-${value}-desktop`); }

    await nav('documents'); await p.waitForFunction(() => di.loaded);
    await p.locator('#di-files').setInputFiles(path.join(repo, 'demo-data/A-experience/D08/D08A_aster_text.pdf'));
    await p.waitForFunction(() => !di.busy && di.documents.length > 0 && document.querySelector('#di-canvas')?.width > 500, null, { timeout: 60000 });
    await p.waitForFunction(() => document.querySelector('#di-source-status')?.textContent.startsWith('PDF text'), null, { timeout: 60000 });
    check(await p.evaluate(() => di.pages[0].method === 'text' && di.documents[0].rows.length === 3), 'existing synthetic text PDF opens the real source viewer');
    await theme('light');
    await p.evaluate(() => { window.__themeDocumentRows = JSON.stringify(di.documents); window.__themeSourcePixels = document.querySelector('#di-canvas').toDataURL(); });
    await p.locator('#di-canvas').scrollIntoViewIfNeeded(); await shot('09-document-source-light');
    await theme('dark');
    check(await p.evaluate(() => JSON.stringify(di.documents) === window.__themeDocumentRows && document.querySelector('#di-canvas').toDataURL() === window.__themeSourcePixels), 'theme preserves document rows and exact original preview pixels');
    check(await p.locator('#di-canvas').evaluate(el => { for (let node = el; node; node = node.parentElement) if (getComputedStyle(node).filter !== 'none') return false; return true; }), 'neither source canvas nor its ancestors apply an inversion filter');
    await p.locator('#di-canvas').scrollIntoViewIfNeeded(); await shot('09-document-source-dark');

    // All current routes, including the explicitly experimental document UI.
    for (const lang of ['ja', 'en']) {
      await language(lang);
      for (const tool of ['home', 'capability', 'recurring', 'cycle', 'batch', 'pareto', 'rci', 'clean', 'documents', 'feedback']) {
        await nav(tool);
        for (const value of ['light', 'dark']) {
          await theme(value); await p.setViewportSize({ width: 1440, height: 1000 });
          check(await p.locator(tool === 'home' ? '.home-hero h1' : '#page-title').isVisible(), `${lang}/${tool}/${value}: title is visible`);
          await noOverflow(`${lang}/${tool}/${value}/desktop`);
          await readable(tool === 'home' ? '.home-description' : '#page-description', `${lang}/${tool}/${value}: supporting text`);
          await readable('#theme-select', `${lang}/${tool}/${value}: theme control`);
          await p.setViewportSize({ width: 390, height: 844 });
          await noOverflow(`${lang}/${tool}/${value}/mobile`);
          const controls = await p.locator('.language-switch, #theme-select').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width }; }));
          const overlap = controls.length === 2 && controls[0].x < controls[1].right && controls[0].right > controls[1].x && controls[0].y < controls[1].bottom && controls[0].bottom > controls[1].y;
          check(controls.every(r => r.x >= 0 && r.right <= 391 && r.width > 0) && !overlap, `${lang}/${tool}/${value}: language/theme controls fit mobile viewport without overlap`);
        }
      }
    }
    await language('ja'); await nav('home');
    for (const value of ['light', 'dark']) { await theme(value); await p.evaluate(() => scrollTo(0, 0)); await shot(`08-home-ja-${value}-mobile`, true); }
    await p.setViewportSize({ width: 1440, height: 1000 });
    await p.emulateMedia({ reducedMotion: 'reduce' });
    check(await p.locator('#release-quality-sample').evaluate(el => getComputedStyle(el).transitionDuration) === '0s', 'reduced-motion preference disables control transitions');
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    await p.evaluate(() => document.activeElement?.blur());
    for (let tabs = 0; tabs < 50 && !await p.locator('#theme-select').evaluate(el => el === document.activeElement); tabs++) await p.keyboard.press('Tab');
    check(await p.locator('#theme-select').evaluate(el => { const s = getComputedStyle(el); return el === document.activeElement && (s.outlineStyle !== 'none' || s.boxShadow !== 'none'); }), 'theme control has a visible keyboard focus indicator');
    await p.locator('#theme-select').press('Tab'); check(await p.evaluate(() => document.activeElement !== document.body), 'Tab reaches the next control');
    await nav('feedback'); check(await p.locator('#feedback-unconfigured').isVisible(), 'feedback remains truthfully unconfigured'); await shot('10-feedback-dark');

    await nav('capability'); await theme('dark');
    const expectedSheet = await p.evaluate(() => buildReport('capability').sheets[0]);
    await p.locator('#print').click();
    check(await p.locator('#report-dialog .report-document').evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(255, 255, 255)', 'report preview keeps a white background under Dark');
    await readable('#report-dialog .report-document p', 'report preview text under Dark');
    const downloadEvent = p.waitForEvent('download'); await p.locator('#report-excel').click();
    const download = await downloadEvent, workbookFile = path.join(out, 'capability-from-dark.xlsx'); await download.saveAs(workbookFile);
    const workbook = XLSX.read(fs.readFileSync(workbookFile), { type: 'buffer' });
    const actualSheet = XLSX.utils.sheet_to_json(workbook.Sheets[expectedSheet[0]], { header: 1, defval: null });
    assert.deepEqual(actualSheet, expectedSheet[1].map(row => row.map(value => value ?? null))); check(true, 'downloaded Excel report matches all summary cells before theme changes');
    await p.evaluate(() => { window.print = () => {}; }); await p.locator('#report-pdf').click();
    await p.emulateMedia({ media: 'print' });
    check(await p.locator('#generated-print').evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(255, 255, 255)', 'printed report keeps a white background under Dark');
    await readable('#generated-print p', 'printed report text under Dark');
    check(await p.locator('#generated-print .axis-label').first().evaluate(el => getComputedStyle(el).fill) !== 'rgb(255, 255, 255)', 'printed chart labels are not white on white');
    await p.pdf({ path: path.join(out, 'capability-from-dark.pdf'), format: 'A4', printBackground: true });
    await p.emulateMedia({ media: 'screen' }); await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));

    await nav('clean'); await p.locator('#clean-reviewed').check(); const cleanBefore = await stateSnapshot(); await theme('light'); await theme('dark');
    check(await stateSnapshot() === cleanBefore && await p.locator('#clean-reviewed').isChecked(), 'Clean & Export review and source/edit data survive theme changes');
    const cleanEvent = p.waitForEvent('download'); await p.locator('#clean-export').click(); const cleanDownload = await cleanEvent;
    const cleanFile = path.join(out, 'cleaned-from-dark.xlsx'); await cleanDownload.saveAs(cleanFile);
    check(XLSX.read(fs.readFileSync(cleanFile), { type: 'buffer' }).SheetNames.includes('Cleaned'), 'Clean & Export produces a readable workbook under Dark');
    check(await p.evaluate(() => window.__themeNoReload === 'still here'), 'all theme, language and route changes used no page reload');

    const denied = await browser.newContext({ colorScheme: 'light' });
    await denied.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage blocked for test', 'SecurityError'); } }); });
    const blocked = await denied.newPage(), blockedErrors = []; blocked.on('pageerror', e => blockedErrors.push(e.message));
    await blocked.goto(url + '#home'); await blocked.waitForSelector('#theme-select'); await blocked.locator('#theme-select').selectOption('dark');
    check(await blocked.locator('html').getAttribute('data-theme') === 'dark', 'blocked storage still allows immediate Dark mode');
    await blocked.locator('[data-language="en"]').click();
    check(await blocked.locator('html').getAttribute('data-theme') === 'dark' && blockedErrors.length === 0, 'blocked storage keeps session theme through language changes without runtime errors'); await denied.close();

    const allowedOrigin = new URL(url).origin;
    check(requests.every(request => new URL(request.url).origin === allowedOrigin), 'no new external network destinations');
    check(requests.filter(request => request.afterLoad).every(request => request.method === 'GET' && request.body === null), 'theme and analysis interactions send no request bodies');
    check(errors.length === 0, 'no uncaught browser errors');
    const launchSHA256 = hash(fs.readFileSync(path.join(repo, 'Launch.html')));
    check(loadedLaunchSHA256 === launchSHA256, 'screenshots and tests used the exact final Launch bytes');
    const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
    const result = {
      checks, url, browser: browser.version(), runAt: new Date().toISOString(),
      revision: { branch: git(['branch', '--show-current']), baseCommit: git(['rev-parse', 'HEAD']), workingTree: git(['status', '--short']), launchSHA256, loadedLaunchSHA256 },
      scope: 'Existing synthetic demos; Chromium desktop/mobile; PDF and XLSX exports; no production mutations.',
      screenshots, contrast, errors, requests,
      limitations: ['Contrast is sampled for normal supporting text, controls, cards, a tooltip and report text; this is not a complete accessibility certification.', 'Experimental Document Intelligence uses a real text PDF and original viewer; scanned OCR recognition accuracy is covered by the existing separate tests.', 'Mobile uses desktop Chromium viewport emulation, not a physical mobile device.']
    };
    fs.writeFileSync(path.join(out, 'theme-summary.json'), JSON.stringify(result, null, 2));
    console.log('COMPLETE', checks, 'theme browser checks;', screenshots.length, 'screenshots');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
