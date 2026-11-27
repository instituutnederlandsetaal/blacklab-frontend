"""Assemble GitHub Pages from the stable releases and both development branches."""
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from release import VERSION, git, main_release, ref


def release_lines():
    """Latest patch tag per major/minor, newest line first."""
    lines = {}
    for tag in git("tag", "--sort=-version:refname").splitlines():
        match = VERSION.fullmatch(tag)
        if match:
            major, minor = int(match[1]), int(match[2])
            if (major, minor) >= (4, 3):
                lines.setdefault(f"/{major}/{minor}/", tag)
    return lines


def build(ref, bases, output):
    npm = "npm.cmd" if os.name == "nt" else "npm"
    with TemporaryDirectory() as directory:
        checkout = Path(directory) / "source"
        git("worktree", "add", "--quiet", "--detach", str(checkout), ref)
        try:
            docs = checkout / "docs"
            subprocess.run([npm, "ci"], cwd=docs, check=True)
            for base in bases:
                print(f"Building {ref} at {base}", flush=True)
                subprocess.run(
                    [npm, "run", "docs:build", "--", "--base", base,
                     "--outDir", str(output / base.strip("/"))],
                    env={**os.environ, "DOCS_REF": ref.removeprefix("origin/")},
                    cwd=docs, check=True,
                )
        finally:
            git("worktree", "remove", "--force", str(checkout))


def main():
    output = Path("target/pages").resolve()
    lines = release_lines()
    if not lines:
        raise SystemExit("No stable docs tags from 4.3.0 onwards. Fetch the repository tags first.")

    stable = main_release()
    # VitePress empties its output directory. Build the site root first.
    sites = {stable: ["/"]}
    for base, tag in lines.items():
        sites.setdefault(tag, []).append(base)
    for branch, base in (("dev", "/dev/"), ("experimental", "/next/")):
        source = branch if ref(f"refs/heads/{branch}") else f"origin/{branch}"
        sites[source] = [base]
    for source, bases in sites.items():
        build(source, bases, output)

    links = [f'<li><a href="{base}">{tag}</a></li>' for base, tag in lines.items()]
    versions = output / "versions"
    versions.mkdir(exist_ok=True)
    (versions / "index.html").write_text(
        '<!doctype html>\n<html lang="en"><meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>BlackLab Frontend documentation versions</title>\n'
        '<h1>BlackLab Frontend documentation</h1>\n'
        f'<p><a href="/">Latest stable ({stable})</a> · <a href="/dev/">Development (dev)</a> · '
        '<a href="/next/">Experimental preview</a></p>\n'
        '<ul>\n' + "\n".join(links) + '\n</ul>\n'
        '<p><a href="https://github.com/instituutnederlandsetaal/blacklab-frontend/releases">Release notes</a></p>\n'
        '</html>\n', encoding="utf-8",
    )


if __name__ == "__main__":
    os.chdir(Path(__file__).resolve().parents[1])
    main()
