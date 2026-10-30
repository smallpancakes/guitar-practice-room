"""Run the existing browser checks with an isolated, temporary Chrome profile."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import html
import os
import re
import shutil
import subprocess

root = Path(__file__).resolve().parent.parent
browser = os.environ.get('BROWSER') or next(
    (path for name in ('google-chrome', 'chromium', 'chromium-browser')
     if (path := shutil.which(name))), None
)
if not browser:
    raise SystemExit('Chrome or Chromium is required. Set BROWSER to its executable path.')

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with TemporaryDirectory(prefix='guitar-browser-') as profile:
        for page in ('tests.html', 'tests-audio.html', 'tests-ui.html', 'tests-metronome.html', 'tests-input.html', 'tests-fretboard.html', 'tests-staff.html', 'tests-staff-answer.html', 'tests-palette.html', 'tests-i18n.html'):
            result = subprocess.run([
                browser, '--headless', '--no-sandbox', '--disable-gpu',
                f'--user-data-dir={profile}', '--dump-dom', f'--virtual-time-budget={60000 if page in ("tests-audio.html", "tests-fretboard.html") else 5000}',
                f'http://127.0.0.1:{server.server_port}/{page}',
            ], capture_output=True, text=True, timeout=45)
            match = re.search(r'<pre id="results">(.*?)</pre>', result.stdout, re.S)
            print(f'\n{page}\n{html.unescape(match.group(1)) if match else "No test results"}')
            if result.returncode or '<title>PASS</title>' not in result.stdout:
                print(result.stderr)
                raise SystemExit(f'Browser checks failed: {page}')
finally:
    server.shutdown()
    server.server_close()
