import traditionalChinese from './translations-zh-Hant.js';

const preferenceKey = 'practice-room.language.v1';
const supported = value => value === 'en' || value === 'zh-Hant';
export function resolveLocale(requested, saved, languages = []) {
  if (supported(requested)) return requested;
  if (supported(saved)) return saved;
  for (const language of languages) {
    // Traditional Chinese is our available Chinese translation.
    if (/^zh(?:-|$)/i.test(language)) return 'zh-Hant';
    if (/^en(?:-|$)/i.test(language)) return 'en';
  }
  return 'en';
}
let saved;
try { saved = localStorage.getItem(preferenceKey); } catch { /* Preference is optional. */ }
export const locale = resolveLocale(new URLSearchParams(location.search).get('lang'), saved, navigator.languages?.length ? navigator.languages : [navigator.language]);

// Plain strings and tagged templates share one catalog; numbered placeholders can be reordered.
export function t(message, ...values) {
  const key = Array.isArray(message)
    ? message.reduce((text, part, index) => text + (index ? `{${index - 1}}` : '') + part, '')
    : message;
  const translated = locale === 'zh-Hant' ? traditionalChinese[key] ?? key : key;
  return String(translated).replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
}

// Translate authored markup once. Runtime messages use t() explicitly; no DOM observer.
export function translateMarkup(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) {
    if (node.parentElement?.closest('script, style, noscript, [translate="no"]')) continue;
    const source = node.textContent.trim();
    if (source) node.textContent = node.textContent.replace(source, () => t(source));
  }
  for (const element of root.querySelectorAll('[aria-label], [title], [placeholder], meta[name="description"], meta[property^="og:"]')) {
    for (const attribute of ['aria-label', 'title', 'placeholder', 'content']) {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, t(element.getAttribute(attribute)));
    }
  }
}
export function lockLanguage(locked) {
  const select = document.getElementById('language');
  if (!select) return;
  select.disabled = locked;
  select.title = locked ? t('Change language after finishing or cancelling this round.') : '';
}

const select = document.getElementById('language');
if (select) {
  document.documentElement.lang = locale;
  translateMarkup(document.documentElement);
  select.value = locale;
  document.documentElement.removeAttribute('data-i18n-pending');
  // Query parameters also carry the preference when browser storage is unavailable.
  if (locale !== 'en' || new URLSearchParams(location.search).has('lang')) for (const link of document.querySelectorAll('.tool-nav a, .wordmark, a[href="fretboard.html"]')) {
    const url = new URL(link.href);
    url.searchParams.set('lang', locale);
    link.href = url.href;
  }
  select.addEventListener('change', () => {
    if (!supported(select.value)) return;
    try { localStorage.setItem(preferenceKey, select.value); } catch { /* URL carries the choice. */ }
    const url = new URL(location.href);
    url.searchParams.set('lang', select.value);
    location.assign(url.href);
  });
}
