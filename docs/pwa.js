import { t } from './i18n.js';
// Test iframes should never install a worker over other browser test fixtures.
if ('serviceWorker' in navigator && window.isSecureContext && window.top === window) {
  const footer = document.createElement('footer'); footer.className = 'pwa-footer';
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'text-button'; retry.textContent = t('Retry'); retry.hidden = true;
  const entry = document.createElement('section'); entry.className = 'pwa-install';
  const install = document.createElement('button'); install.type = 'button'; install.className = 'pwa-install-button';
  install.setAttribute('aria-expanded', 'false'); install.setAttribute('aria-controls', 'install-guide');
  function icon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const shape = document.createElementNS(svg.namespaceURI, 'path'); shape.setAttribute('d', path); svg.append(shape); return svg;
  }
  install.append(icon('M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5'), document.createTextNode(t('Install app')));
  const help = document.createElement('div'); help.id = 'install-guide'; help.className = 'pwa-install-guide'; help.hidden = true;
  const title = document.createElement('h2'); title.textContent = t('Add to your home screen');
  const hint = document.createElement('p');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  hint.textContent = ios ? t('Open this page in Safari, then:') : t('In your browser menu:');
  const steps = document.createElement('ol');
  const labels = ios ? [t('Share'), t('Add to Home Screen'), t('Add')] : [t('Open the browser menu'), t('Install app or Add to Home Screen'), t('Confirm installation')];
  const paths = ios ? ['M12 16V3m-4 4 4-4 4 4M8 10H5v11h14V10h-3', 'M4 10 12 3l8 7v11H4ZM9 15h6m-3-3v6', 'M5 12h14m-7-7v14'] : ['M5 6h14M5 12h14M5 18h14', 'M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5', 'm5 12 4 4L19 6'];
  labels.forEach((label, i) => { const li = document.createElement('li'); li.append(icon(paths[i]), document.createTextNode(label)); steps.append(li); });
  const guideStatus = document.createElement('p'); guideStatus.className = 'pwa-guide-status';
  function setStatus(message) { status.textContent = guideStatus.textContent = t(message); }
  const close = document.createElement('button'); close.type = 'button'; close.className = 'text-button'; close.textContent = t('Close guide');
  function showGuide(open) { help.hidden = !open; install.setAttribute('aria-expanded', String(open)); }
  close.addEventListener('click', () => { showGuide(false); install.focus(); });
  entry.addEventListener('keydown', event => { if (event.key === 'Escape' && !help.hidden) { showGuide(false); install.focus(); } });
  const dismiss = document.createElement('button'); dismiss.id = 'pwa-installed'; dismiss.type = 'button'; dismiss.className = 'text-button'; dismiss.textContent = t('Already installed');
  const guideActions = document.createElement('div'); guideActions.className = 'pwa-guide-actions'; guideActions.append(close, dismiss);
  help.append(title, hint, steps, guideStatus, guideActions); entry.append(install, help);
  document.querySelector('.tool-nav').after(entry);
  const notice = document.createElement('div'); notice.id = 'pwa-install-dismissed'; notice.className = 'pwa-dismiss-notice'; notice.hidden = true; notice.tabIndex = -1;
  const noticeText = document.createElement('p'); noticeText.id = 'pwa-dismiss-message'; noticeText.setAttribute('role', 'status');
  noticeText.textContent = t('Install button hidden. You can find Install guide at the bottom of any page.');
  notice.setAttribute('aria-labelledby', noticeText.id);
  const reopen = document.createElement('button'); reopen.type = 'button'; reopen.className = 'text-button'; reopen.textContent = t('Show install guide');
  const acknowledge = document.createElement('button'); acknowledge.type = 'button'; acknowledge.className = 'text-button'; acknowledge.textContent = t('Got it');
  const noticeActions = document.createElement('div'); noticeActions.className = 'pwa-guide-actions'; noticeActions.append(reopen, acknowledge);
  notice.append(noticeText, noticeActions); entry.after(notice);
  const refresh = document.createElement('a'); refresh.href = './update.html'; refresh.textContent = t('Refresh app'); refresh.className = 'text-button';
  const guideLink = document.createElement('button'); guideLink.id = 'pwa-install-guide-link'; guideLink.type = 'button'; guideLink.className = 'text-button'; guideLink.textContent = t('Install guide'); guideLink.hidden = true;
  footer.append(status, retry, guideLink, refresh); document.querySelector('main').append(footer);
  let deferred, installed = false, dismissed = false;
  const dismissalKey = 'practice-room.install-dismissed.v1';
  try { dismissed = localStorage.getItem(dismissalKey) === 'yes'; } catch { /* Keep the choice for this visit. */ }
  function saveDismissal(value) {
    dismissed = value;
    try { if (value) localStorage.setItem(dismissalKey, 'yes'); else localStorage.removeItem(dismissalKey); } catch { /* Storage is optional. */ }
    syncVisibility();
  }
  dismiss.addEventListener('click', () => { saveDismissal(true); notice.hidden = false; notice.focus(); });
  function reopenGuide() { saveDismissal(false); showGuide(true); install.focus(); }
  guideLink.addEventListener('click', reopenGuide);
  reopen.addEventListener('click', reopenGuide);
  acknowledge.addEventListener('click', () => { notice.hidden = true; document.querySelector('.tool-nav [aria-current="page"]')?.focus({ preventScroll: true }); });
  window.addEventListener('storage', event => { if (event.key === dismissalKey || event.key === null) { dismissed = event.newValue === 'yes'; syncVisibility(); } });
  const display = matchMedia('(display-mode: standalone)');
  const standalone = () => display.matches || navigator.standalone || installed;
  function syncVisibility() { entry.hidden = Boolean(standalone() || dismissed); guideLink.hidden = Boolean(standalone() || !dismissed); if (entry.hidden) showGuide(false); if (standalone() || !dismissed) notice.hidden = true; }
  syncVisibility(); display.addEventListener('change', syncVisibility);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event; syncVisibility(); });
  install.addEventListener('click', async () => {
    if (!deferred) { showGuide(help.hidden); return; }
    const prompt = deferred; deferred = null; install.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome !== 'accepted') showGuide(true);
    } catch { showGuide(true); }
    finally { install.disabled = false; syncVisibility(); }
  });
  window.addEventListener('appinstalled', () => { deferred = null; installed = true; syncVisibility(); });
  async function register() {
    retry.hidden = true; setStatus('Preparing offline…');
    try {
      const registration = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { updateViaCache: 'none' });
      const watch = worker => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant' && !registration.active) { setStatus('Offline setup failed'); retry.hidden = false; }
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      await navigator.serviceWorker.ready;
      setStatus('Offline ready'); retry.hidden = true;
    } catch { setStatus('Offline setup failed'); retry.hidden = false; }
  }
  retry.addEventListener('click', register);
  void register();
}
