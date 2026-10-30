"""Copy only browser assets into the directory exposed by Tailscale Serve."""
from pathlib import Path
from shutil import copyfile, copytree

root = Path(__file__).resolve().parent.parent
destination = root / '.tailnet-public'
destination.mkdir(exist_ok=True)
for name in ('index.html', 'i18n.js', 'translations-zh-Hant.js', 'palette.js', 'palettes.css', 'style.css', 'app.js', 'engine.js', 'metronome.html', 'metronome.js', 'metronome-engine.js', 'fretboard.html', 'fretboard.css', 'fretboard.js', 'guitar-audio.js', 'fretboard-engine.js', 'staff-answer.js', 'staff-answer.css', 'staff.html', 'staff.css', 'staff.js', 'staff-engine.js'):
    copyfile(root / name, destination / name)
copytree(root / 'assets', destination / 'assets', dirs_exist_ok=True)
print(f'Prepared browser assets in {destination}')
