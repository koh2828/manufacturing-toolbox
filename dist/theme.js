(function (root) {
  'use strict';
  // UI preference only. Existing manufacturing-data and project keys are unchanged.
  const KEY = 'manufacturing-toolbox.theme.v1';
  const valid = value => ['system', 'light', 'dark'].includes(value);
  let preference = 'system', resolved = 'light', media = null;
  try { const saved = root.localStorage?.getItem(KEY); if (valid(saved)) preference = saved; } catch {}
  try { media = root.matchMedia?.('(prefers-color-scheme: dark)') || null; } catch {}

  function apply() {
    resolved = preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference;
    const html = root.document?.documentElement;
    if (html) {
      html.dataset.theme = resolved;
      html.dataset.themePreference = preference;
      html.style.colorScheme = resolved;
    }
    const control = root.document?.getElementById('theme-select');
    if (control) control.value = preference;
  }

  function setPreference(value) {
    if (!valid(value)) return false;
    preference = value;
    apply(); // No render, reload, or mutation of analysis/editor state.
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem(KEY, value);
      return true;
    } catch { return false; }
  }

  function initControls() {
    const control = root.document?.getElementById('theme-select');
    if (!control || control.dataset.themeBound) return;
    control.dataset.themeBound = 'true';
    control.value = preference;
    control.addEventListener('change', () => {
      const saved = setPreference(control.value);
      if (!saved && root.I18n && typeof root.toast === 'function') root.toast(root.I18n.t('theme.saveFailed'));
    });
  }

  const onSystemChange = () => { if (preference === 'system') apply(); };
  if (media?.addEventListener) media.addEventListener('change', onSystemChange);
  else media?.addListener?.(onSystemChange);
  apply(); // This script runs in the head, before stylesheet and application scripts.
  if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', initControls, { once: true });
  else initControls();
  const api = { KEY, setPreference, initControls, get preference() { return preference; }, get resolved() { return resolved; } };
  root.ToolboxTheme = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
