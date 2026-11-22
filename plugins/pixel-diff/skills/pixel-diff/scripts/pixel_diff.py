#!/usr/bin/env python3
"""Bootstrap the pinned local environment, then run the comparison CLI."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import venv


def main():
    if not (3, 11) <= sys.version_info[:2] <= (3, 13):
        print('pixel-diff needs Python 3.11-3.13. Install that runtime, then rerun this command.', file=sys.stderr)
        return 2
    root = Path(__file__).resolve().parent
    requirements = root / 'requirements.txt'
    fingerprint = hashlib.sha256(requirements.read_bytes()).hexdigest()[:12]
    env_root = Path(os.environ.get('PIXEL_DIFF_ENV_ROOT', root.parent / '.runtime'))
    env = env_root / f'py{sys.version_info.major}{sys.version_info.minor}-{fingerprint}'
    python = env / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
    expected = dict(line.split('==') for line in requirements.read_text().splitlines() if line)
    probe = ('import importlib.metadata as m, json; '
             'print(json.dumps({p:m.version(p) for p in ["Pillow","numpy"]}))')

    def ready():
        if not python.exists():
            return False
        result = subprocess.run([str(python), '-c', probe], capture_output=True, text=True)
        try:
            return result.returncode == 0 and json.loads(result.stdout) == expected
        except ValueError:
            return False

    try:
        if not ready():
            env_root.mkdir(parents=True, exist_ok=True)
            lock = env.with_suffix('.setup-lock')
            try:
                lock.mkdir()
            except FileExistsError:
                raise RuntimeError(f'Setup is already running. Retry when it finishes. If it was interrupted, remove only this stale lock: {lock}')
            try:
                if not ready():
                    print(f'Setting up pinned packages in {env}', file=sys.stderr)
                    venv.EnvBuilder(with_pip=True).create(env)
                    subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check',
                                    '--only-binary=:all:', '-r', str(requirements)],
                                   stdout=sys.stderr, check=True)
                    if not ready():
                        raise RuntimeError('Installed package versions do not match requirements.txt.')
            finally:
                lock.rmdir()
        # Run as a child for Windows compatibility; preserve the worker exit status.
        return subprocess.call([str(python), str(root / 'pd_cli.py'), *sys.argv[1:]])
    except (OSError, RuntimeError, subprocess.SubprocessError) as exc:
        print(f'pixel-diff setup error: {exc}\n'
              'Install Python 3.11-3.13 with venv/pip support. On Debian, install python3-venv.\n'
              'Choose a writable isolated environment with PIXEL_DIFF_ENV_ROOT. Permit PyPI downloads\n'
              'for first setup, or supply wheel files using PIP_NO_INDEX=1 and PIP_FIND_LINKS.\n'
              f'To recreate this environment, remove only {env} and rerun. Global packages are untouched.',
              file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == '__main__':
    sys.exit(main())
