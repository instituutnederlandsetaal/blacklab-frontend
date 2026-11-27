#!/usr/bin/env python3
import argparse
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from release import VERSION, main_release

IMAGE = 'instituutnederlandsetaal/blacklab-frontend'


def build(name, push):
    version = VERSION.fullmatch(name)
    if not version and name not in ('main', 'dev', 'experimental'):
        raise SystemExit('Use main, dev, experimental, or a stable X.Y.Z tag.')

    # A regular clone keeps the .git metadata Maven reads inside the Docker build.
    with TemporaryDirectory(prefix='blacklab-frontend-build-') as checkout:
        subprocess.run(['git', 'clone', '--quiet', '--branch', name, '.', checkout], check=True)
        if name == 'main':
            base = main_release(cwd=checkout).split('.')[0]
            tags = ['latest']
        elif version:
            base = version[1]
            tags = [name, f'{base}.{version[2]}', base]
        else:
            base = 'dev'
            tags = [name]

        command = ['docker', 'buildx', 'build', '--file', 'docker/frontend-bls.dockerfile',
                   '--build-arg', f'BLACKLAB_IMAGE_VERSION={base}']
        command.extend(['--push', '--platform', 'linux/amd64'] if push else ['--load'])
        for tag in tags:
            command.extend(['--tag', f'{IMAGE}:{tag}'])
        subprocess.run([*command, '.'], cwd=checkout, check=True)


def main():
    parser = argparse.ArgumentParser(description='Build the combined BlackLab Frontend Docker image from Git.')
    parser.add_argument('ref', help='main, dev, experimental, or a local stable X.Y.Z tag')
    parser.add_argument('--push', action='store_true', help='Publish to Docker Hub instead of loading locally')
    args = parser.parse_args()
    os.chdir(Path(__file__).resolve().parents[1])
    try:
        build(args.ref, args.push)
    except subprocess.CalledProcessError as error:
        raise SystemExit(f'Docker build stopped after {error.cmd[0]} failed.') from None


if __name__ == '__main__':
    main()
