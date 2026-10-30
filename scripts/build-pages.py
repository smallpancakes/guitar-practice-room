"""Package the static app for GitHub Pages without publishing tests or tooling."""
from pathlib import Path
from shutil import copyfile, copytree, rmtree

root = Path(__file__).resolve().parent.parent
destination = root / 'docs'
if destination.exists():
    rmtree(destination)
destination.mkdir()
for name in ('index.html', 'i18n.js', 'translations-zh-Hant.js', 'palette.js', 'palettes.css', 'style.css', 'app.js', 'engine.js', 'metronome.html', 'metronome.js', 'metronome-engine.js', 'fretboard.html', 'fretboard.css', 'fretboard.js', 'guitar-audio.js', 'fretboard-engine.js', 'staff-answer.js', 'staff-answer.css', 'staff.html', 'staff.css', 'staff.js', 'staff-engine.js'):
    copyfile(root / name, destination / name)
copytree(root / 'assets', destination / 'assets')
(destination / '.nojekyll').touch()
print(f'Prepared GitHub Pages assets in {destination}')
