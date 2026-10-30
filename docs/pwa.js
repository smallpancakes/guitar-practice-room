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
  help.append(title, hint, steps, guideStatus, close); entry.append(install, help);
  document.querySelector('.tool-nav').after(entry);
  const refresh = document.createElement('a'); refresh.href = './update.html'; refresh.textContent = t('Refresh app'); refresh.className = 'text-button';
  footer.append(status, retry, refresh); document.querySelector('main').append(footer);
  let deferred, installed = false;
  const display = matchMedia('(display-mode: standalone)');
  const standalone = () => display.matches || navigator.standalone || installed;
  function syncVisibility() { entry.hidden = Boolean(standalone()); if (entry.hidden) showGuide(false); }
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
