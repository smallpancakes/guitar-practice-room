"""Exercise the packaged PWA in Chromium with the network truly disabled (CDP)."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import struct
import subprocess
from tempfile import TemporaryDirectory
from threading import Thread
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent

class CDP:
    def __init__(self, url):
        u = urlsplit(url)
        self.sock = socket.create_connection((u.hostname, u.port), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(f'GET {u.path} HTTP/1.1\r\nHost: {u.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        header = b''
        while not header.endswith(b'\r\n\r\n'):
            header += self.sock.recv(1)
        assert header.startswith(b'HTTP/1.1 101 '), header
        accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest())
        assert accept in header, 'Invalid WebSocket handshake'
        self.seq = 0
    def read(self, n):
        data = b''
        while len(data) < n:
            chunk = self.sock.recv(n - len(data))
            if not chunk: raise RuntimeError('CDP connection closed')
            data += chunk
        return data
    def call(self, method, params=None):
        self.seq += 1
        payload = json.dumps({'id': self.seq, 'method': method, 'params': params or {}}).encode()
        mask = os.urandom(4)
        size = len(payload)
        header = bytes([0x81, 0x80 | size]) if size < 126 else bytes([0x81, 0xfe]) + struct.pack('!H', size)
        self.sock.sendall(header + mask + bytes(v ^ mask[i % 4] for i, v in enumerate(payload)))
        chunks = b''
        while True:
            first, second = self.read(2)
            size = second & 127
            if size == 126: size = struct.unpack('!H', self.read(2))[0]
            if size == 127: size = struct.unpack('!Q', self.read(8))[0]
            data = self.read(size)
            if first & 15 in (0, 1): chunks += data
            if not first & 128: continue
            if not chunks: continue
            message = json.loads(chunks); chunks = b''
            if message.get('id') == self.seq:
                if 'error' in message: raise RuntimeError(message['error'])
                return message.get('result', {})
    def js(self, expression):
        result = self.call('Runtime.evaluate', {'expression': expression, 'awaitPromise': True, 'returnByValue': True})
        if 'exceptionDetails' in result: raise RuntimeError(result['exceptionDetails'])
        return result.get('result', {}).get('value')
    def until(self, expression):
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            try:
                if self.js(expression): return
            except RuntimeError: pass  # A navigation may replace the execution context.
            time.sleep(.1)
        raise AssertionError(f'Timed out: {expression}; caches={self.js("caches.keys()")}')

with TemporaryDirectory(prefix='guitar-pwa-') as directory:
    base = Path(directory)
    for scope in ('guitar', 'guitar-practice-room'):
        shutil.copytree(ROOT / 'docs', base / scope)
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs): super().__init__(*args, directory=directory, **kwargs)
        def log_message(self, *args): pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    profile = base / 'chrome'
    browser = shutil.which('chromium') or shutil.which('google-chrome')
    process = subprocess.Popen([browser, '--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', f'--user-data-dir={profile}', '--autoplay-policy=no-user-gesture-required', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 15
        while not (profile / 'DevToolsActivePort').exists():
            assert time.monotonic() < deadline, 'Chrome did not start'
            time.sleep(.1)
        port = (profile / 'DevToolsActivePort').read_text().splitlines()[0]
        def new_tab():
            target = json.load(urlopen(Request(f'http://127.0.0.1:{port}/json/new?about:blank', method='PUT')))
            client = CDP(target['webSocketDebuggerUrl'])
            client.call('Network.enable')
            client.call('Page.enable')
            return target, client
        def offline(client, value):
            client.call('Network.emulateNetworkConditions', {'offline': value, 'latency': 0, 'downloadThroughput': -1, 'uploadThroughput': -1})
        for scope in ('guitar', 'guitar-practice-room'):
            target, client = new_tab()
            url = f'http://127.0.0.1:{server.server_port}/{scope}/'
            client.call('Page.navigate', {'url': url + 'fretboard.html?lang=zh-Hant'})
            client.until("document.querySelector('.pwa-footer [role=status]')?.textContent === '可離線使用' && !!navigator.serviceWorker.controller")
            assert client.js("navigator.serviceWorker.controller.scriptURL") == url + 'sw.js'
            manifest = client.js("fetch('manifest.webmanifest').then(r=>r.json())")
            assert manifest['scope'] == './' and manifest['display'] == 'standalone'
            assert client.js("Promise.all(['assets/icon-192.png','assets/icon-512.png'].map(src=>new Promise(resolve=>{const i=new Image();i.onload=()=>resolve(i.naturalWidth);i.src=src})))") == [192, 512]
            assert client.js("!document.querySelector('.pwa-install').hidden && document.querySelector('.tool-nav').nextElementSibling.classList.contains('pwa-install')"), 'install entry is visible below navigation'
            client.js("document.querySelector('.pwa-install-button').click()")
            assert client.js("!document.getElementById('install-guide').hidden && document.querySelector('.pwa-guide-status').textContent==='可離線使用'"), 'guide opens with offline readiness'
            client.js("document.querySelector('#install-guide button').click()")
            assert client.js("document.getElementById('install-guide').hidden"), 'guide closes'
            assert client.js("!!document.getElementById('pwa-installed')"), 'already-installed dismissal is available'
            client.js("document.querySelector('.pwa-install-button').click();document.getElementById('pwa-installed').click()")
            assert client.js("document.querySelector('.pwa-install').hidden && !document.getElementById('pwa-install-guide-link').hidden"), 'dismissed entry stays accessible through footer'
            assert client.js("!document.getElementById('pwa-install-dismissed').hidden && document.getElementById('pwa-dismiss-message').textContent.includes('每頁底部')"), 'dismissal explains where to find installation again'
            assert client.js("document.activeElement.id==='pwa-install-dismissed'"), 'focus remains at visible confirmation'
            client.js("document.querySelector('#pwa-install-dismissed button').click()")
            assert client.js("!document.getElementById('install-guide').hidden && document.getElementById('pwa-install-dismissed').hidden"), 'confirmation restores guide directly'
            client.js("document.getElementById('pwa-installed').click();document.querySelector('#pwa-install-dismissed button:last-child').click()")
            assert client.js("document.getElementById('pwa-install-dismissed').hidden && document.querySelector('.pwa-install').hidden"), 'acknowledging keeps installation dismissed'
            client.call('Page.navigate', {'url':url+'metronome.html?lang=zh-Hant'})
            client.until("document.querySelector('.pwa-install')?.hidden && !!document.getElementById('pwa-install-guide-link')")
            client.js("document.getElementById('pwa-install-guide-link').click()")
            assert client.js("!document.querySelector('.pwa-install').hidden && !document.getElementById('install-guide').hidden"), 'footer restores guide and install option'
            client.js("document.querySelector('#install-guide button').click()")
            client.js("window.installCalls=0;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.installCalls++};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e);document.querySelector('.pwa-install-button').click()")
            client.until("window.installCalls===1 && !document.querySelector('.pwa-install-button').disabled && !document.getElementById('install-guide').hidden")
            client.js("window.dispatchEvent(new Event('appinstalled'))")
            assert client.js("document.querySelector('.pwa-install').hidden"), 'installed app hides entry'
            script=client.call('Page.addScriptToEvaluateOnNewDocument', {'source':"Object.defineProperty(navigator,'standalone',{value:true})"})
            client.call('Page.navigate', {'url':url+'?lang=zh-Hant'})
            client.until("document.querySelector('.pwa-install')?.hidden")
            client.call('Page.removeScriptToEvaluateOnNewDocument', {'identifier':script['identifier']})
            client.call('Page.navigate', {'url':url+'?lang=zh-Hant'})
            client.until("document.querySelector('.pwa-install') && !document.querySelector('.pwa-install').hidden")
            if scope == 'guitar':
                client.call('Network.setUserAgentOverride', {'userAgent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'})
                client.call('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
                client.call('Page.navigate', {'url':url+'?lang=zh-Hant'})
                client.until("!!document.querySelector('.pwa-install-button')")
                client.js("document.querySelector('.pwa-install-button').click()")
                assert client.js("document.querySelector('#install-guide ol').textContent==='分享加入主畫面加入'"), 'iPhone steps'
                assert client.js("document.documentElement.scrollWidth<=window.innerWidth"), 'mobile guide fits'
                client.js("document.querySelector('.pwa-install').scrollIntoView({block:'start'})")
                shot=client.call('Page.captureScreenshot', {'format':'png'})
                Path('/tmp/guitar-install-mobile.png').write_bytes(base64.b64decode(shot['data']))
                client.call('Network.setUserAgentOverride', {'userAgent':'Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36'})
                client.call('Emulation.clearDeviceMetricsOverride')
            print(f'PASS {scope}: prominent install entry, fallback guide, native prompt and standalone visibility')
            print(f'PASS {scope}: install, manifest, icons and full offline readiness')
            client.js("localStorage.setItem('pwa-progress-check','preserved')")
            offline(client, True)
            for page, control in [('index.html', 'manual'), ('metronome.html', 'metro-toggle'), ('fretboard.html', 'exercise-six'), ('staff.html', 'start')]:
                client.call('Page.navigate', {'url': url + page + '?lang=en'})
                client.until(f"document.getElementById('{control}') && document.querySelector('.pwa-footer [role=status]')?.textContent === 'Offline ready'")
                client.js(f"document.getElementById('{control}').click()")
                if page == 'index.html':
                    client.js("document.getElementById('tap').click()")
                    assert client.js("document.getElementById('count').textContent") == '1'
                if page == 'metronome.html':
                    client.until("document.getElementById('metro-toggle').getAttribute('aria-pressed')==='true'")
                if page == 'fretboard.html':
                    client.js("document.querySelector('[data-position=\"0:0\"]').click()")
                    assert client.js("document.getElementById('round-count').textContent") == '1 / 6 strings'
                    client.until("!document.getElementById('audio-error').hidden === false")
                    client.call('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
                    client.until("document.getElementById('fretboard').classList.contains('vertical-board')")
                    client.js("document.getElementById('question-start').scrollIntoView({block:'start',behavior:'instant'})")
                    assert client.js("getComputedStyle(document.querySelector('.note-prompt')).position==='static'"), 'question stays in normal flow'
                    client.until("document.getElementById('floating-question').hidden")
                    assert client.js("getComputedStyle(document.getElementById('board-scroll')).display==='contents' && document.getElementById('board-scroll').scrollTop===0"), 'vertical board wrapper creates no scroll box'
                    client.js("document.querySelector('[data-position=\"0:10\"]').scrollIntoView({block:'center',behavior:'instant'})")
                    client.until("!document.getElementById('floating-question').hidden")
                    assert client.js("document.querySelector('#floating-question strong').textContent==='Find E · every string'"), 'separate reminder shows current question'
                    assert client.js("getComputedStyle(document.querySelector('.note-prompt')).position==='static'"), 'original question never changes position mode'
                    assert client.js("(()=>{const r=document.querySelector('[data-position=\"0:10\"]').getBoundingClientRect();return r.top>document.getElementById('floating-question').getBoundingClientRect().bottom&&r.bottom<innerHeight})()"), 'fret ten is visible below reminder'
                    assert client.js("document.getElementById('round-count').textContent") == '1 / 6 strings', 'scrolling preserves hunt progress'
                    client.js("['1:5','2:9','3:2','4:7','5:0'].forEach(id=>document.querySelector('[data-position=\"'+id+'\"]').click())")
                    client.until("!document.getElementById('next').hidden")
                    client.js("document.getElementById('next').click()")
                    client.until("document.getElementById('board-scroll').scrollTop<1 && document.getElementById('question-start').getBoundingClientRect().top>=-1 && document.getElementById('question-start').getBoundingClientRect().bottom<innerHeight")
                    client.until("document.getElementById('floating-question').hidden")
                    assert client.js("document.getElementById('round-count').textContent") == '0 / 6 strings', 'next note resets board and progress'
                    client.call('Emulation.clearDeviceMetricsOverride')
                assert client.js("localStorage.getItem('pwa-progress-check')") == 'preserved'
            result = client.js("""(async()=>{const {guitarSample,guitarBuffer}=await import('./guitar-audio.js');const c=new OfflineAudioContext(1,44100,44100);const b=await guitarBuffer(c,guitarSample(64).url);const s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.start();const rendered=await c.startRendering();return rendered.getChannelData(0).some(v=>Math.abs(v)>.01)})()""")
            assert result, 'offline guitar recording must render audibly'
            assert client.js("document.fonts.check('80px Bravura')"), 'notation font works offline'
            print(f'PASS {scope}: offline tools, query URLs, progress, fonts and sampled audio')
            offline(client, False)
            # Change only the packaged test copy, leaving the source release untouched.
            worker = base / scope / 'sw.js'
            worker.write_text(re.sub(r"PREFIX \+ '[a-f0-9]+'", "PREFIX + 'test-update'", worker.read_text()))
            assert client.js("document.getElementById('pwa-update').hidden"), 'no update notice for current version'
            client.js("(()=>{const now=Date.now;Date.now=()=>now()+61000;document.dispatchEvent(new Event('visibilitychange'));Date.now=now})()")
            client.until("navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)")
            client.until("!document.getElementById('pwa-update').hidden")
            assert client.js("document.querySelector('#pwa-update [role=status]').textContent==='New version ready'"), 'downloaded update is announced'
            assert client.js("document.querySelector('#pwa-update a').href.endsWith('/update.html?lang=en')"), 'update action opens recovery screen'
            client.call('Page.navigate', {'url':url+'fretboard.html?lang=zh-Hant'})
            client.until("document.getElementById('pwa-update') && !document.getElementById('pwa-update').hidden")
            assert client.js("document.querySelector('#pwa-update [role=status]').textContent==='有新版本可更新'"), 'waiting update remains visible across tools in selected language'
            assert client.js("navigator.serviceWorker.controller.state") == 'activated'
            print(f'PASS {scope}: update waits without interrupting the open app')
            client.sock.close()
            urlopen(f'http://127.0.0.1:{port}/json/close/{target["id"]}').close()
            target, client = new_tab()
            # Wait outside app scope until the closed tab releases its controller.
            client.call('Page.navigate', {'url': f'http://127.0.0.1:{server.server_port}/'})
            client.until(f"navigator.serviceWorker.getRegistration('{url}').then(r=>r && !r.waiting && r.active?.state==='activated')")
            client.call('Page.navigate', {'url': url})
            client.until("!!navigator.serviceWorker.controller && document.querySelector('.pwa-footer [role=status]')?.textContent === 'Offline ready'")
            client.until(f"caches.keys().then(keys=>keys.filter(k=>k.startsWith('guitar-offline:{url}:')).length===1 && keys.some(k=>k==='guitar-offline:{url}:test-update'))")
            assert client.js("localStorage.getItem('pwa-progress-check')") == 'preserved'
            print(f'PASS {scope}: update activates after closing and preserves local data')
            client.call('Page.navigate', {'url':url+'update.html?lang=en'})
            client.until("!!document.getElementById('refresh-app')")
            client.js("caches.open('unrelated-app').then(c=>c.put('/unrelated',new Response('keep')))" )
            client.js(f"caches.open('guitar-offline:{url}:test-update').then(c=>c.put('{url}style.css',new Response('stale-test-css')))")
            offline(client, True)
            client.js("document.getElementById('refresh-app').click()")
            client.until("!document.getElementById('refresh-app').disabled && document.getElementById('refresh-status').textContent.includes('Could not download')")
            assert client.js(f"caches.open('guitar-offline:{url}:test-update').then(c=>c.match('{url}style.css')).then(r=>r.text())") == 'stale-test-css', 'failed refresh preserves cache'
            assert client.js("localStorage.getItem('pwa-progress-check')") == 'preserved'
            offline(client, False)
            worker.write_text(worker.read_text().replace("PREFIX + 'test-update'", "PREFIX + 'test-refresh'"))
            client.js("document.getElementById('refresh-app').click()")
            client.until("location.pathname.endsWith('/') && document.querySelector('.pwa-footer [role=status]')?.textContent === 'Offline ready'")
            assert client.js("localStorage.getItem('pwa-progress-check')") == 'preserved'
            assert client.js("caches.open('unrelated-app').then(c=>c.match('/unrelated')).then(r=>r.text())") == 'keep'
            assert client.js("fetch('style.css').then(r=>r.text())") != 'stale-test-css'
            assert client.js(f"caches.keys().then(keys=>keys.includes('guitar-offline:{url}:test-refresh'))")
            print(f'PASS {scope}: refresh recovers stale files, activates latest worker and preserves saved data/unrelated caches; offline failure is safe')

            client.sock.close()
            urlopen(f'http://127.0.0.1:{port}/json/close/{target["id"]}').close()
    finally:
        process.terminate(); process.wait(timeout=10)
        server.shutdown(); server.server_close()
