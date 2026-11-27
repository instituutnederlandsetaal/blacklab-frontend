from contextlib import redirect_stdout
from io import StringIO
import os
from pathlib import Path
import shlex
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from release import git, release
from build_docker import build
from build_docs import main as build_site, release_lines


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.addCleanup(os.chdir, Path.cwd())
        self.remote = Path(directory.name) / 'origin.git'
        work = Path(directory.name) / 'work'
        git('init', '--bare', str(self.remote))
        git('init', '--initial-branch=main', str(work))
        os.chdir(work)
        git('config', 'user.name', 'Release Test')
        git('config', 'user.email', 'release@example.test')
        git('config', 'commit.gpgsign', 'false')
        git('config', 'tag.gpgsign', 'false')
        Path('src/frontend').mkdir(parents=True)
        Path('docs/src/060_release_notes').mkdir(parents=True)
        Path('pom.xml').write_text('<project><artifactId>blacklab-frontend</artifactId>\n<version>4.3.0</version></project>')
        Path('src/frontend/package.json').write_text('{"version": "4.3.0"}')
        Path('src/frontend/package-lock.json').write_text('{"version": "4.3.0", "packages": {"": {"version": "4.3.0"}}}')
        Path('docs/src/060_release_notes/4.3.0.md').write_text('# Previous release')
        git('add', '.')
        git('commit', '-m', 'Previous release')
        git('tag', '4.3.0')
        git('remote', 'add', 'origin', str(self.remote))
        git('push', 'origin', 'main', 'refs/tags/4.3.0')
        git('switch', '-c', 'dev')
        git('commit', '--allow-empty', '-m', 'Add feature')
        self.editor = shlex.join([Path(sys.executable).as_posix(), '-c',
                                  "import sys; open(sys.argv[1], 'a').write('\\nEdited notes\\n')"])

    def make_release(self, bump, push=False):
        output = StringIO()
        with patch('release.run_checks'), patch.dict(os.environ, {'GIT_EDITOR': self.editor}), \
             patch('builtins.input', return_value=bump), redirect_stdout(output):
            release(push)
        return output.getvalue().splitlines()[-1]

    def test_major_release_and_older_maintenance(self):
        previous = git('rev-parse', 'main')
        push_command = self.make_release('major')
        self.assertEqual(git('rev-parse', 'main', cwd=self.remote), previous)
        self.assertFalse(git('tag', '--list', '5.0.0', cwd=self.remote))
        self.assertIn('Add feature', Path('docs/src/060_release_notes/5.0.0.md').read_text())
        self.assertIn('5.0.0', Path('pom.xml').read_text())
        self.assertEqual(Path('src/frontend/package-lock.json').read_text().count('5.0.0'), 2)
        git('commit', '--allow-empty', '-m', 'After release')
        subprocess.run(shlex.split(push_command), check=True)
        for name in ('main', 'dev', '5.0.0'):
            self.assertEqual(git('rev-parse', name, cwd=self.remote), git('rev-parse', '5.0.0'))
        self.assertFalse(git('branch', '--list', 'v4-maintenance'))
        self.assertFalse(git('branch', '--list', 'v4-maintenance', cwd=self.remote))
        git('switch', '-c', 'v4-maintenance', previous)
        git('commit', '--allow-empty', '-m', 'Backport fix')
        self.make_release('patch', True)
        for name in ('4.3.1', 'v4-maintenance'):
            self.assertEqual(git('rev-parse', name, cwd=self.remote), git('rev-parse', '4.3.1'))
        self.assertEqual(git('rev-parse', 'main', cwd=self.remote), git('rev-parse', '5.0.0'))
        self.assertEqual(git('rev-parse', 'main'), previous)

    def test_current_maintenance_updates_main_and_atomic_push(self):
        git('worktree', 'add', '../main-worktree', 'main')
        git('switch', '-c', 'v4-maintenance', 'main')
        git('commit', '--allow-empty', '-m', 'Fix')
        self.make_release('patch', True)
        for name in ('main', 'v4-maintenance', '4.3.1'):
            self.assertEqual(git('rev-parse', name, cwd=self.remote), git('rev-parse', '4.3.1'))
        self.assertEqual(git('rev-parse', 'HEAD', cwd='../main-worktree'), git('rev-parse', '4.3.0'))

    def test_docker_build_uses_exact_git_commit_and_tags(self):
        git('tag', '4.3.1')
        revision = git('rev-parse', 'HEAD')
        git('branch', 'experimental')
        git('commit', '--allow-empty', '-m', 'Unreleased change')
        Path('pom.xml').write_text('uncommitted content')
        real_run = subprocess.run
        seen = []
        commits = []

        def run(command, **kwargs):
            if command[0] != 'docker':
                return real_run(command, **kwargs)
            seen.append(command)
            checkout = Path(kwargs['cwd'])
            self.assertTrue((checkout / '.git').is_dir())
            self.assertNotEqual((checkout / 'pom.xml').read_text(), 'uncommitted content')
            commits.append(git('rev-parse', 'HEAD', cwd=checkout))

        with patch('build_docker.subprocess.run', side_effect=run):
            build('4.3.1', True)
            build('experimental', False)
            build('main', False)
            git('branch', '-f', 'main', 'HEAD')
            with self.assertRaisesRegex(SystemExit, 'stable'):
                build('main', False)
        self.assertEqual([seen[0][i + 1] for i, arg in enumerate(seen[0]) if arg == '--tag'],
                         ['instituutnederlandsetaal/blacklab-frontend:4.3.1',
                          'instituutnederlandsetaal/blacklab-frontend:4.3',
                          'instituutnederlandsetaal/blacklab-frontend:4'])
        self.assertIn('BLACKLAB_IMAGE_VERSION=4', seen[0])
        self.assertIn('BLACKLAB_IMAGE_VERSION=dev', seen[1])
        self.assertIn('instituutnederlandsetaal/blacklab-frontend:experimental', seen[1])
        self.assertIn('BLACKLAB_IMAGE_VERSION=4', seen[2])
        self.assertIn('instituutnederlandsetaal/blacklab-frontend:latest', seen[2])
        self.assertEqual(commits, [revision, revision, git('rev-parse', '4.3.0')])

    def test_docs_pick_latest_stable_patch_per_line(self):
        for tag in ('4.2.13', '4.3.9', '4.3.10', '5.0.0', '5.1.0', '5.2.0-beta1', 'v6.0.0'):
            git('tag', tag)
        self.assertEqual(list(release_lines().items()), [('/5/1/', '5.1.0'), ('/5/0/', '5.0.0'), ('/4/3/', '4.3.10')])

    def test_pages_builds_main_at_root_and_both_previews(self):
        git('tag', '5.0.0')  # origin/main is still at 4.3.0
        git('push', 'origin', 'HEAD:refs/heads/experimental')
        output = Path('target/pages')
        output.mkdir(parents=True)
        with patch('build_docs.build') as build:
            build_site()
        self.assertEqual([call.args[:2] for call in build.call_args_list], [
            ('4.3.0', ['/', '/4/3/']), ('5.0.0', ['/5/0/']),
            ('dev', ['/dev/']), ('origin/experimental', ['/next/']),
        ])
        index = (output / 'versions/index.html').read_text(encoding='utf-8')
        for base in ('/', '/4/3/', '/5/0/', '/dev/', '/next/'):
            self.assertIn(f'href="{base}"', index)

    def test_failed_release_checks_see_final_files_and_leave_refs_alone(self):
        before = git('rev-parse', 'HEAD')

        def fail_build():
            self.assertIn('4.3.1', Path('pom.xml').read_text())
            self.assertIn('Edited notes', Path('docs/src/060_release_notes/4.3.1.md').read_text())
            raise subprocess.CalledProcessError(1, ['mvn', 'verify'])

        with patch('release.run_checks', side_effect=fail_build), patch.dict(os.environ, {'GIT_EDITOR': self.editor}), \
             patch('builtins.input', return_value='patch'), self.assertRaises(subprocess.CalledProcessError):
            release(False)
        self.assertEqual(git('rev-parse', 'HEAD'), before)
        self.assertEqual(git('rev-parse', 'main'), git('rev-parse', '4.3.0'))
        self.assertFalse(git('tag', '--list', '4.3.1'))

    def test_diverged_remote_branch_rejects_entire_push(self):
        other = git('commit-tree', 'HEAD^{tree}', '-p', 'HEAD', '-m', 'Another change')
        git('push', 'origin', f'{other}:refs/heads/dev')
        with self.assertRaises(subprocess.CalledProcessError):
            self.make_release('minor', True)
        self.assertEqual(git('rev-parse', 'dev', cwd=self.remote), other)
        self.assertEqual(git('rev-parse', 'main', cwd=self.remote), git('rev-parse', '4.3.0'))
        self.assertFalse(git('tag', '--list', '4.4.0', cwd=self.remote))
        self.assertEqual(git('rev-parse', '4.4.0'), git('rev-parse', 'HEAD'))

    def test_experimental_and_dirty_tree_are_rejected(self):
        git('switch', '-c', 'experimental')
        with self.assertRaisesRegex(SystemExit, 'experimental'):
            release(False)
        git('switch', 'dev')
        Path('untracked').write_text('changes')
        with self.assertRaisesRegex(SystemExit, 'clean'):
            release(False)


if __name__ == '__main__':
    unittest.main()
