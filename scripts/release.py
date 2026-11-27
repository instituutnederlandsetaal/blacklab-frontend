#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
NPM = "npm.cmd" if os.name == "nt" else "npm"


def git(*args, cwd=None):
    return subprocess.check_output(["git", *args], cwd=cwd, encoding="utf-8").strip()


def ref(name):
    return subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", name],
        stdout=subprocess.PIPE, text=True, check=False,
    ).stdout.strip()


def require_clean():
    if git("status", "--porcelain", "--untracked-files=all") or any(
        Path(git("rev-parse", "--git-path", state)).exists()
        for state in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge",
                      "rebase-apply", "sequencer")
    ):
        raise SystemExit("Finish in-progress Git operations and clean the working tree first.")


def main_release(cwd=None):
    at_main = git("tag", "--points-at", "refs/remotes/origin/main", cwd=cwd).splitlines()
    tags = [tag for tag in at_main if VERSION.fullmatch(tag)]
    if len(tags) != 1:
        raise SystemExit("main must point directly to exactly one stable X.Y.Z tag.")
    return tags[0]


def last_release(branch):
    for tag in git("tag", "--merged", "HEAD", "--sort=-version:refname").splitlines():
        match = VERSION.fullmatch(tag)
        if match and (branch == "dev" or branch == f"v{match[1]}-maintenance"):
            return tag
    raise SystemExit(f"No stable release tag for {branch} in its history.")


def run_checks():
    subprocess.run(["mvn.cmd" if os.name == "nt" else "mvn", "--no-transfer-progress", "clean", "verify"], check=True)
    subprocess.run([NPM, "ci"], cwd="docs", check=True)
    subprocess.run([NPM, "run", "docs:build"], cwd="docs", check=True)
    subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "scripts"], check=True)


def set_version(version):
    pom = Path("pom.xml")
    package = Path("src/frontend/package.json")
    lock = Path("src/frontend/package-lock.json")
    pom_text = pom.read_text(encoding="utf-8")
    pattern = r"(<artifactId>blacklab-frontend</artifactId>\s*<version>)([^<]+)(</version>)"
    match = re.search(pattern, pom_text)
    package_data = json.loads(package.read_text(encoding="utf-8"))
    lock_data = json.loads(lock.read_text(encoding="utf-8"))
    versions = (package_data["version"], lock_data["version"], lock_data["packages"][""]["version"])
    if not match or any(current != match[2] for current in versions):
        raise SystemExit("POM, package.json and package-lock.json versions must match.")
    subprocess.run([NPM, "version", version, "--no-git-tag-version", "--ignore-scripts", "--allow-same-version"],
                   cwd=package.parent, check=True)
    pom.write_text(pom_text[:match.start(2)] + version + pom_text[match.end(2):], encoding="utf-8", newline="\n")


def edit_notes(version, previous_tag):
    commits = git("log", "--reverse", "--format=- %s (%h)%n%w(0,2,2)%b", f"{previous_tag}..HEAD")
    notes = Path(f"docs/src/060_release_notes/{version}.md")
    with notes.open("x", encoding="utf-8", newline="\n") as draft:
        draft.write(f"# {version}\n\n## Fixes\n\n## Features\n\n"
                    f"## Improvements\n\n## Miscellaneous\n\n## Commits to sort\n\n{commits}\n")
    editor = git("var", "GIT_EDITOR")
    command = shlex.split(editor)
    if command and Path(command[0]).stem.lower() in {"code", "code-insiders"} and not {"-w", "--wait"}.intersection(command):
        editor += " --wait"
    subprocess.run(["git", "config", "--file", str(notes), "--edit"],
                   env={**os.environ, "GIT_EDITOR": editor}, check=True)
    if not notes.read_text(encoding="utf-8").strip():
        raise SystemExit("The release notes are empty.")
    return notes


def release(push):
    require_clean()
    if git("rev-parse", "--is-shallow-repository") == "true":
        raise SystemExit("Fetch the full Git history before preparing a release.")
    branch = git("symbolic-ref", "--short", "HEAD")
    if branch != "dev" and not re.fullmatch(r"v(0|[1-9][0-9]*)-maintenance", branch):
        raise SystemExit("Run on dev or v<major>-maintenance; merge experimental into dev first.")
    if push:
        git("fetch", "--tags", "origin")
    head = git("rev-parse", "HEAD")
    main_major = main_release().split(".")[0]
    update_main = branch in ("dev", f"v{main_major}-maintenance")

    previous_tag = last_release(branch)
    major, minor, patch = map(int, previous_tag.split("."))
    bumps = {"patch": (major, minor, patch + 1), "minor": (major, minor + 1, 0)}
    if branch == "dev":
        bumps["major"] = (major + 1, 0, 0)
    bump = input(f"Bump {previous_tag} ({'/'.join(bumps)})? ").strip().lower()
    if bump not in bumps:
        raise SystemExit("No release created. Choose one of the offered increments.")
    version = ".".join(map(str, bumps[bump]))
    tag = f"refs/tags/{version}"
    if ref(tag):
        raise SystemExit(f"Tag {version} already exists.")

    notes = edit_notes(version, previous_tag)
    if git("branch", "--show-current") != branch or git("rev-parse", "HEAD") != head:
        raise SystemExit("The release branch changed while editing release notes.")
    set_version(version)
    files = [notes.as_posix(), "pom.xml", "src/frontend/package.json", "src/frontend/package-lock.json"]
    git("add", "--", *files)
    run_checks()
    if git("branch", "--show-current") != branch or git("rev-parse", "HEAD") != head:
        raise SystemExit("The release branch changed during the build.")
    if git("diff", "--name-only") or git("ls-files", "--others", "--exclude-standard"):
        raise SystemExit("The build left changes in the working tree. Inspect them before releasing.")
    if set(git("diff", "--cached", "--name-only").splitlines()) - set(files):
        raise SystemExit("Other files were staged while preparing the release.")
    subprocess.run(["git", "commit", "-m", f"Release {version}", "--", *files], check=True)
    commit = git("rev-parse", "HEAD")
    if git("rev-parse", "HEAD^") != head or git("symbolic-ref", "--short", "HEAD") != branch:
        raise SystemExit("The release branch changed before committing the release notes.")
    git("tag", version, commit)
    push_command = ["git", "push", "--atomic", "--no-follow-tags", "origin", tag, f"{commit}:refs/heads/{branch}"]
    if update_main:
        push_command.append(f"{commit}:refs/heads/main")
    print(f"Release {version} prepared locally. Notes saved to {notes}.", flush=True)
    print("Push command", shlex.join(push_command), sep="\n", flush=True)
    if push:
        subprocess.run(push_command, check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare a stable BlackLab Frontend release.")
    parser.add_argument("--push", action="store_true", help="Push the release refs atomically to origin.")
    args = parser.parse_args()
    os.chdir(Path(__file__).resolve().parents[1])
    try:
        release(args.push)
    except subprocess.CalledProcessError as error:
        raise SystemExit(f"Release stopped after {shlex.join(error.cmd)} failed.") from None
    except (EOFError, KeyboardInterrupt):
        raise SystemExit("Release interrupted.") from None
