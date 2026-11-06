// Runs in the head before the body can paint. The module translator reveals Chinese pages.
const supported = value => value === 'en' || value === 'zh-Hant';
const requested = new URLSearchParams(location.search).get('lang');
let saved;
try { saved = localStorage.getItem('practice-room.language.v1'); } catch { /* Storage is optional. */ }
let language = supported(requested) ? requested : supported(saved) ? saved : 'en';
if (!supported(requested) && !supported(saved)) {
  for (const item of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    if (/^zh(?:-|$)/i.test(item)) { language = 'zh-Hant'; break; }
    if (/^en(?:-|$)/i.test(item)) break;
  }
}
document.documentElement.lang = language;
if (language === 'zh-Hant') {
  document.documentElement.setAttribute('data-i18n-pending', '');
  // If a translation script fails to load, keep the page usable.
  setTimeout(() => document.documentElement.removeAttribute('data-i18n-pending'), 10000);
}
