"""Generate a content-versioned offline shell shared by both deployment targets."""
from pathlib import Path
import hashlib
import json

RUNTIME = ('index.html', 'i18n.js', 'translations-zh-Hant.js', 'palette.js', 'palettes.css', 'style.css', 'app.js', 'engine.js', 'metronome.html', 'metronome.js', 'metronome-engine.js', 'fretboard.html', 'fretboard.css', 'fretboard.js', 'guitar-audio.js', 'fretboard-engine.js', 'staff-answer.js', 'staff-answer.css', 'staff.html', 'staff.css', 'staff.js', 'staff-engine.js', 'pwa.js', 'manifest.webmanifest')

def build_worker(root):
    assets = sorted(RUNTIME + tuple(p.relative_to(root).as_posix() for p in (root / 'assets').rglob('*') if p.is_file()))
    template = (root / 'scripts/sw-template.js').read_text()
    digest = hashlib.sha256(template.encode())
    for name in assets:
        digest.update(name.encode())
        digest.update((root / name).read_bytes())
    (root / 'sw.js').write_text(template.replace('__VERSION__', digest.hexdigest()[:16]).replace('__ASSETS__', json.dumps(assets)))
