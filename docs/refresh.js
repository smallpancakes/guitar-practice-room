// This recovery entry is deliberately excluded from the offline cache.
const scope = new URL('./', location.href).href;
const button = document.getElementById('refresh-app'), status = document.getElementById('refresh-status');
let zh = /^zh/i.test(navigator.language);
try { const saved = localStorage.getItem('practice-room.language.v1'); if (saved) zh = saved === 'zh-Hant'; } catch { /* Browser language is enough. */ }
if (new URLSearchParams(location.search).has('lang')) zh = new URLSearchParams(location.search).get('lang') === 'zh-Hant';
document.documentElement.lang = zh ? 'zh-Hant' : 'en';
for (const el of document.querySelectorAll('[data-zh]')) if (zh) el.textContent = el.dataset.zh;
const say = (en, chinese) => status.textContent = zh ? chinese : en;
function installed(worker) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Update timed out')); }, 60000);
    const cleanup = () => { clearTimeout(timer); worker.removeEventListener('statechange', check); };
    const check = () => {
      if (['installed', 'activated'].includes(worker.state)) { cleanup(); resolve(); }
      else if (worker.state === 'redundant') { cleanup(); reject(new Error('Update failed')); }
    };
    worker.addEventListener('statechange', check); check();
  });
}
button.addEventListener('click', async () => {
  button.disabled = true;
  say('Downloading the latest version…', '正在下載最新版本…');
  try {
    // This uncached endpoint verifies connectivity before touching any offline files.
    const online = await fetch(new URL('update.html?check=' + Date.now(), scope), { cache: 'no-store' });
    if (!online.ok) throw new Error('Offline');
    const registration = await navigator.serviceWorker.register(new URL('sw.js', scope), { scope, updateViaCache: 'none' });
    await registration.update();
    if (registration.installing) await installed(registration.installing);
    if (registration.waiting) {
      const waiting = registration.waiting;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { cleanup(); reject(new Error('Activation timed out')); }, 60000);
        const cleanup = () => { clearTimeout(timer); waiting.removeEventListener('statechange', check); };
        const check = () => { if (waiting.state === 'activated') { cleanup(); resolve(); } else if (waiting.state === 'redundant') { cleanup(); reject(new Error('Activation failed')); } };
        waiting.addEventListener('statechange', check); waiting.postMessage({ type: 'ACTIVATE_UPDATE' }); check();
      });
    }
    const active = registration.active;
    if (!active) throw new Error('No active worker');
    await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('Download timed out')); }, 60000);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data?.ok ? resolve() : reject(new Error('Download failed')); };
      active.postMessage({ type: 'REFRESH_APP' }, [channel.port2]);
    });
    say('Updated. Reopening the app…', '已更新，正在重新開啟…');
    location.replace(new URL('./?lang=' + (zh ? 'zh-Hant' : 'en'), scope));
  } catch {
    say('Could not download the update. Check your connection and try again. Saved progress is unchanged.', '下載未完成，請確認網路後重試。練習紀錄不受影響。');
    button.disabled = false;
  }
});
