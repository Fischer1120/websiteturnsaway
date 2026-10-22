// Presentation preference only. This module never remounts page content.
(() => {
  const key = 'wta:appearance';
  const modes = new Set(['system', 'light', 'dark']);
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  let preference = 'system';

  function readPreference() {
    try {
      const stored = localStorage.getItem(key);
      return modes.has(stored) ? stored : 'system';
    } catch {
      return preference;
    }
  }

  function apply() {
    const resolved = preference === 'system' ? (system.matches ? 'dark' : 'light') : preference;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    const color = document.querySelector('meta[name="theme-color"]');
    if (color) color.content = resolved === 'dark' ? '#080a0d' : '#ffffff';
    for (const select of document.querySelectorAll('[data-theme-preference]')) {
      if (!(select instanceof HTMLSelectElement)) continue;
      select.value = preference;
      select.closest('[data-theme-control]')?.removeAttribute('hidden');
    }
  }

  preference = readPreference();
  apply();
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  document.addEventListener('change', (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement) || !select.matches('[data-theme-preference]') || !modes.has(select.value)) return;
    preference = select.value;
    try {
      if (preference === 'system') localStorage.removeItem(key);
      else localStorage.setItem(key, preference);
    } catch { /* The current page can still change appearance without storage. */ }
    apply();
  });
  system.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = readPreference();
    apply();
  });
  window.addEventListener('pageshow', () => {
    preference = readPreference();
    apply();
  });
})();
