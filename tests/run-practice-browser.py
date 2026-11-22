#!/usr/bin/env python3
"""Run the practice browser test against a fresh, isolated application and database."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

root = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix='italiano-practice-e2e-') as tmp:
    work = Path(tmp) / 'app'
    work.mkdir()
    for name in ('src', 'public'):
        shutil.copytree(root / name, work / name)
    for name in ('next.config.ts', 'postcss.config.mjs', 'tsconfig.json', 'package.json'):
        shutil.copy2(root / name, work / name)
    (work / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    env = dict(os.environ, ITALIANO_DB_PATH=str(Path(tmp) / 'test.sqlite'),
               ITALIANO_TEST_URL='http://127.0.0.1:3219', ITALIANO_PRACTICE_ISOLATED='1',
               NODE_OPTIONS=(os.environ.get('NODE_OPTIONS', '') + ' --experimental-sqlite').strip())
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 3219))
    subprocess.run(['node', 'node_modules/next/dist/bin/next', 'build', '--webpack'], cwd=work, env=env, check=True)
    server = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3219'], cwd=work, env=env)
    try:
        for _ in range(60):
            if server.poll() is not None:
                raise RuntimeError('Serveur arrêté')
            try:
                with urllib.request.urlopen(env['ITALIANO_TEST_URL']):
                    break
            except OSError:
                time.sleep(.5)
        else:
            raise RuntimeError('Serveur indisponible')
        specs = sys.argv[1:] or ['tests/practice-browser.spec.ts']
        subprocess.run(['node', 'node_modules/@playwright/test/cli.js', 'test', *specs, '--output', str(Path(tmp) / 'results'), '--reporter=line'], cwd=root, env=env, check=True)
    finally:
        server.terminate()
        server.wait(timeout=10)
