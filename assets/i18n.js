// Page localization: picks the language, loads i18n/<lang>.json and applies it to the markup.
// The page declares its languages on <html data-langs="en ru">; English is the fallback.
(function () {
  const STORAGE_KEY = 'lang';
  const FALLBACK = 'en';
  const root = document.documentElement;
  const supported = (root.dataset.langs || FALLBACK).split(/\s+/).filter(Boolean);
  const listeners = [];
  let strings = {};

  function stored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function store(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      // Storage blocked: the choice lasts for this visit only.
    }
  }

  function pick() {
    const saved = stored();
    if (saved && supported.includes(saved)) return saved;
    for (const tag of navigator.languages || [navigator.language]) {
      const primary = String(tag).toLowerCase().split('-')[0];
      if (supported.includes(primary)) return primary;
    }
    return supported.includes(FALLBACK) ? FALLBACK : supported[0];
  }

  function t(key, vars) {
    const text = strings[key];
    if (text == null) return null;
    return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? vars[name] : m)) : text;
  }

  function apply() {
    root.lang = I18n.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const text = t(el.dataset.i18n);
      if (text != null) el.textContent = text;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(';')) {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        const text = t(key);
        if (attr && text != null) el.setAttribute(attr, text);
      }
    });
    const title = t('page.title');
    if (title != null) document.title = title;
    const description = t('page.description');
    const meta = document.querySelector('meta[name="description"]');
    if (description != null && meta) meta.content = description;
    document.querySelectorAll('[data-lang-switch] button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.lang === I18n.lang));
    });
  }

  async function load(lang) {
    const response = await fetch(`i18n/${lang}.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status} for i18n/${lang}.json`);
    return response.json();
  }

  async function use(lang) {
    try {
      strings = await load(lang);
      I18n.lang = lang;
    } catch (e) {
      // The markup holds the English texts, so the page stays usable.
      console.error('Failed to load strings', e);
      strings = {};
      I18n.lang = FALLBACK;
    }
    apply();
    listeners.forEach((listener) => listener(I18n.lang));
  }

  function renderSwitch() {
    const container = document.querySelector('[data-lang-switch]');
    if (!container || supported.length < 2) return;
    for (const lang of supported) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.lang = lang;
      button.textContent = lang.toUpperCase();
      button.addEventListener('click', () => {
        if (lang === I18n.lang) return;
        store(lang);
        use(lang);
      });
      container.append(button);
    }
    container.hidden = false;
  }

  const I18n = {
    lang: FALLBACK,
    t,
    onChange(listener) {
      listeners.push(listener);
    },
  };
  window.I18n = I18n;

  I18n.ready = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', async () => {
      renderSwitch();
      await use(pick());
      root.classList.remove('i18n-pending');
      resolve(I18n.lang);
    });
  });
})();
