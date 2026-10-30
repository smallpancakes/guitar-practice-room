"""Copy only browser assets into the directory exposed by Tailscale Serve."""
from pwa import RUNTIME, build_worker
from pathlib import Path
from shutil import copyfile, copytree

root = Path(__file__).resolve().parent.parent
destination = root / '.tailnet-public'
destination.mkdir(exist_ok=True)
build_worker(root)
for name in (*RUNTIME, 'sw.js', 'update.html', 'refresh.js'):
    copyfile(root / name, destination / name)
copytree(root / 'assets', destination / 'assets', dirs_exist_ok=True)
print(f'Prepared browser assets in {destination}')
