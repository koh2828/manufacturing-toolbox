const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = () => fs.readFileSync(path.join(__dirname, '../dist/theme.js'), 'utf8');
const KEY = 'manufacturing-toolbox.theme.v1';

// A small browser boundary, not a copy of the theme implementation. This makes
// denied storage and legacy matchMedia events deterministic without a browser.
function environment({ saved = null, dark = false, failRead = false, failWrite = false, legacy = false } = {}) {
  const stored = new Map(saved === null ? [] : [[KEY, saved]]);
  const mediaListeners = new Set(), domListeners = new Map(), controlListeners = new Map();
  const select = {
    value: '', dataset: {},
    addEventListener(name, fn) { if (!controlListeners.has(name)) controlListeners.set(name, new Set()); controlListeners.get(name).add(fn); },
    setAttribute(name, value) { this[name] = String(value); }
  };
  const root = { dataset: {}, style: {}, setAttribute(name, value) { if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); else this[name] = String(value); } };
  const media = { matches: dark, media: '(prefers-color-scheme: dark)' };
  if (legacy) media.addListener = fn => mediaListeners.add(fn);
  else media.addEventListener = (name, fn) => { assert.equal(name, 'change'); mediaListeners.add(fn); };
  const document = {
    documentElement: root, readyState: 'complete',
    getElementById: id => id === 'theme-select' ? select : null,
    querySelector: selector => selector === '#theme-select' ? select : null,
    querySelectorAll: () => [],
    addEventListener(name, fn) { domListeners.set(name, fn); }
  };
  let writes = 0;
  const context = {
    document, console, matchMedia: () => media,
    localStorage: {
      getItem(key) { if (failRead) throw new Error('Storage denied'); return stored.get(key) ?? null; },
      setItem(key, value) { writes++; if (failWrite) throw new Error('Storage quota'); stored.set(key, String(value)); }
    },
    addEventListener(name, fn) { domListeners.set(name, fn); }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source(), context, { filename: 'theme.js' });
  const api = context.ToolboxTheme;
  assert.ok(api, 'ToolboxTheme is available');
  const osChange = next => { media.matches = next; for (const fn of mediaListeners) fn({ matches: next }); };
  return { api, root, select, stored, controlListeners, osChange, get writes() { return writes; } };
}

test('theme has a separate stable setting key and defaults to the OS scheme', () => {
  for (const dark of [false, true]) {
    const e = environment({ dark });
    assert.equal(e.api.KEY, KEY);
    assert.equal(e.api.preference, 'system');
    assert.equal(e.api.resolved, dark ? 'dark' : 'light');
    assert.equal(e.root.dataset.theme, e.api.resolved);
    assert.equal(e.root.dataset.themePreference, 'system');
    assert.equal(e.writes, 0, 'initial rendering does not persist manufacturing data or unnecessary settings');
  }
});

test('only System follows OS changes; explicit choices remain authoritative', () => {
  const e = environment();
  e.osChange(true); assert.equal(e.api.resolved, 'dark');
  assert.equal(e.api.setPreference('light'), true);
  e.osChange(false); e.osChange(true);
  assert.equal(e.api.resolved, 'light'); assert.equal(e.api.preference, 'light');
  assert.equal(e.api.setPreference('dark'), true);
  e.osChange(false); assert.equal(e.api.resolved, 'dark');
  assert.equal(e.api.setPreference('system'), true);
  assert.equal(e.api.resolved, 'light');
  e.osChange(true); assert.equal(e.api.resolved, 'dark');
});

test('stored Light, Dark and System settings restore without depending on analysis state', () => {
  for (const saved of ['light', 'dark', 'system']) {
    const e = environment({ saved, dark: true });
    assert.equal(e.api.preference, saved);
    assert.equal(e.api.resolved, saved === 'light' ? 'light' : 'dark');
    assert.equal(e.root.dataset.themePreference, saved);
    assert.equal(e.writes, 0);
  }
});

test('unrecognized persisted values fall back to System and cannot become CSS selectors', () => {
  for (const saved of ['', 'sepia', '{"theme":"dark"}', '"><script>']) {
    const e = environment({ saved, dark: true });
    assert.equal(e.api.preference, 'system'); assert.equal(e.api.resolved, 'dark');
    assert.equal(e.root.dataset.theme, 'dark');
  }
});

test('invalid explicit preferences neither change the theme nor write storage', () => {
  const e = environment({ saved: 'dark' });
  for (const input of ['invalid', '', null, undefined, {}, 0]) {
    assert.equal(e.api.setPreference(input), false);
    assert.equal(e.api.preference, 'dark'); assert.equal(e.api.resolved, 'dark');
  }
  assert.equal(e.writes, 0);
});

test('denied storage reads use System without preventing theme selection', () => {
  const e = environment({ failRead: true, dark: true });
  assert.equal(e.api.preference, 'system'); assert.equal(e.api.resolved, 'dark');
  assert.equal(e.api.setPreference('light'), true);
  assert.equal(e.api.resolved, 'light');
});

test('failed storage writes report failure but keep the chosen theme in memory', () => {
  const e = environment({ failWrite: true });
  assert.equal(e.api.setPreference('dark'), false);
  assert.equal(e.api.preference, 'dark'); assert.equal(e.root.dataset.theme, 'dark');
  e.osChange(false); assert.equal(e.api.resolved, 'dark');
});

test('control initialization is idempotent and uses the same persistent preference', () => {
  const e = environment({ saved: 'dark' });
  e.api.initControls(); e.api.initControls();
  assert.equal(e.select.value, 'dark');
  const handlers = e.controlListeners.get('change');
  assert.equal(handlers?.size, 1, 'one handler per select');
  e.select.value = 'light'; for (const fn of handlers) fn({ target: e.select });
  assert.equal(e.api.preference, 'light'); assert.equal(e.stored.get(KEY), 'light');
  assert.equal(e.writes, 1, 'a UI action saves exactly once');
});

test('legacy matchMedia listeners still follow System changes', () => {
  const e = environment({ legacy: true }); e.osChange(true);
  assert.equal(e.api.resolved, 'dark');
});

test('loading the theme module outside a browser is safe', () => {
  const context = vm.createContext({ console, module: { exports: {} } });
  assert.doesNotThrow(() => vm.runInContext(source(), context, { filename: 'theme.js' }));
});
