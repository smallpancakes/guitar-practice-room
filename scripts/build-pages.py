"""Package the static app for GitHub Pages without publishing tests or tooling."""
from pwa import RUNTIME, build_worker
from pathlib import Path
from shutil import copyfile, copytree, rmtree

root = Path(__file__).resolve().parent.parent
destination = root / 'docs'
if destination.exists():
    rmtree(destination)
destination.mkdir()
build_worker(root)
for name in (*RUNTIME, 'sw.js'):
    copyfile(root / name, destination / name)
copytree(root / 'assets', destination / 'assets')
(destination / '.nojekyll').touch()
print(f'Prepared GitHub Pages assets in {destination}')
