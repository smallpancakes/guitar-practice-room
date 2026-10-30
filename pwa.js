import { t } from './i18n.js';
// Test iframes should never install a worker over other browser test fixtures.
if ('serviceWorker' in navigator && window.isSecureContext && window.top === window) {
  const footer = document.createElement('footer'); footer.className = 'pwa-footer';
  const status = document.createElement('span'); status.setAttribute('role', 'status');
  const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'text-button'; retry.textContent = t('Retry'); retry.hidden = true;
  const install = document.createElement('button'); install.type = 'button'; install.className = 'text-button'; install.textContent = t('Install app'); install.hidden = true;
  const help = document.createElement('details'), summary = document.createElement('summary'), hint = document.createElement('p');
  summary.textContent = t('Install app');
  hint.textContent = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ? t('In Safari, tap Share, then Add to Home Screen.')
    : t('Use your browser’s Install app or Add to Home Screen option.');
  help.append(summary, hint); footer.append(status, retry, install, help); document.querySelector('main').append(footer);
  let deferred;
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  help.hidden = Boolean(standalone());
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); deferred = event; install.hidden = false; help.hidden = true;
  });
  install.addEventListener('click', async () => {
    if (!deferred) return;
    const prompt = deferred; deferred = null;
    try { await prompt.prompt(); await prompt.userChoice; } catch { /* Browser installation remains available. */ }
    install.hidden = true; help.hidden = Boolean(standalone());
  });
  window.addEventListener('appinstalled', () => { deferred = null; install.hidden = help.hidden = true; });
  async function register() {
    retry.hidden = true; status.textContent = t('Preparing offline…');
    try {
      const registration = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { updateViaCache: 'none' });
      const watch = worker => {
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant' && !registration.active) { status.textContent = t('Offline setup failed'); retry.hidden = false; }
        });
      };
      watch(registration.installing);
      registration.addEventListener('updatefound', () => watch(registration.installing));
      await navigator.serviceWorker.ready;
      status.textContent = t('Offline ready'); retry.hidden = true;
    } catch { status.textContent = t('Offline setup failed'); retry.hidden = false; }
  }
  retry.addEventListener('click', register);
  void register();
}
