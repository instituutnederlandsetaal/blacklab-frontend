#!/usr/bin/env bun

// manage-version.js: Interactive CLI for project version management
// Requirements: enquirer, simple-git, conventional-changelog, open, xml2js, fs/promises


if (!('Bun' in globalThis)) {
  console.error('\x1b[31m%s\x1b[0m', 'This script requires Bun to run. Please install Bun from https://bun.sh');
  process.exit(1);
}


import Enquirer from 'enquirer';
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import open from 'open';
import { parseStringPromise, Builder } from 'xml2js';
import os from 'os';


// Bun: use Bun.spawnSync instead of execSync
// import { execSync } from 'child_process';

// Bun: __dirname is not defined in ESM, so define it

const git = simpleGit();
const rootDir = (await (Bun.$`git rev-parse --show-toplevel`).text()).trim();
const packageJsonPath = path.join(rootDir, 'src/frontend/package.json');
const pomXmlPath = path.join(rootDir, 'pom.xml');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');
const textEditor: string|undefined = (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.TERM_PROGRAM === 'vscode') ? 'code --wait' : (await git.getConfig('core.editor')).value || undefined;
const GIT_BACKUP_TAG = 'VERSION_BUMP_CHECKPOINT';

class Version {
  protected constructor(public major: number, public minor: number, public patch: number, public snapshot: boolean) {}
  static fromString(version: string): Version {
    const m = version.match(/(\d+)\.(\d+)\.(\d+)(-SNAPSHOT)?/);
    if (!m) throw new Error('Invalid version: ' + version);
    return new Version(Number(m[1]), Number(m[2]), Number(m[3]), !!m[4]);
  }
  static clone(version: Version): Version {
    return new Version(version.major, version.minor, version.patch, version.snapshot);
  }
  static fromObject(obj: { major: number; minor: number; patch: number; snapshot?: boolean }): Version {
    return new Version(obj.major, obj.minor, obj.patch, !!obj.snapshot);
  }

  toString() {
    return `${this.major}.${this.minor}.${this.patch}${this.snapshot ? '-SNAPSHOT' : ''}`;
  }

  static highestVersion(v1: Version, v2: Version): Version {
    if (v1.major !== v2.major) return v1.major > v2.major ? v1 : v2;
    if (v1.minor !== v2.minor) return v1.minor > v2.minor ? v1 : v2;
    if (v1.patch !== v2.patch) return v1.patch > v2.patch ? v1 : v2;
    return v1.snapshot ? v2 : v1; // return non-snapshot version
  }

  static equals(v1: Version, v2: Version): boolean {
    return v1.major === v2.major && v1.minor === v2.minor && v1.patch === v2.patch && v1.snapshot === v2.snapshot;
  }

  nextMinorSnapshot(): Version { return new Version(this.major, this.minor + 1, 0, true); }
  nextPatchSnapshot(): Version { return new Version(this.major, this.minor, this.patch + 1, true); }
  nextMajorSnapshot(): Version { return new Version(this.major + 1, 0, 0, true); }
  nonSnapshotVersion(): Version { return new Version(this.major, this.minor, this.patch, false);}
}

async function getVersion(): Promise<Version> {
  const npmVersion = await fs.readFile(packageJsonPath, 'utf8').then(JSON.parse).then(pkg => Version.fromString(pkg.version));
  const pomVersion = await fs.readFile(pomXmlPath, 'utf8').then(xml => parseStringPromise(xml)).then(obj => Version.fromString(obj.project.version[0]));
  if (!Version.equals(npmVersion, pomVersion)) console.warn(`inconsistent versions! NPM: ${npmVersion} - POM: ${pomVersion}`);
  return Version.highestVersion(npmVersion, pomVersion);
}

async function updatePackageJsonVersion(newVersion: string) {
  const pkg = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  pkg.version = newVersion;
  await fs.writeFile(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
}

async function updatePomXmlVersion(newVersion: string) {
  const xml = await fs.readFile(pomXmlPath, 'utf8');
  const obj = await parseStringPromise(xml);
  obj.project.version = [newVersion];
  const builder = new Builder();
  const newXml = builder.buildObject(obj);
  await fs.writeFile(pomXmlPath, newXml);
}

async function ensureCleanGit(): Promise<void> {
  const status = await git.status();
  if (!status.isClean()) {
    throw new Error('You have uncommitted changes. Please commit or stash them first.');
  }
}

async function createChangelog() {
  // 1. Find the latest non-SNAPSHOT version tag
  const versionTags = (await git.tags()).all.filter(t => /^v?[\d\.]+$/.test(t));
  if (!versionTags.length) {
    throw new Error('No previous release tag found. Cannot create changelog.');
  }
  const log = (await git.log({ from: versionTags[versionTags.length-1], to: 'HEAD' })).all
    .map(c => [`# ${c.date} (${c.author_name}) <${c.hash}>`, c.message, c.body].join('\n'))
    .join('\n\n');
  
  await fs.writeFile(changelogPath, log);

  // 5. Let user edit as before
  async function editChangelogWithInstructions() {
    // Prepare temp file with instructions and current changelog
    const tmpPath = path.join(os.tmpdir(), `changelog-edit-${Date.now()}.md`);
    const instructions = [
      '# Edit the changelog below. Lines starting with # are ignored.',
      '# Save and close the editor to continue.',
      '',
    ].join('\n');
    const changelogContent = await fs.readFile(changelogPath, 'utf8');
    await fs.writeFile(tmpPath, instructions + changelogContent);

    if (textEditor) {
      const proc = Bun.spawn({
        cmd: ['sh', '-c', `${textEditor} '${tmpPath}'`],
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
      });
      const exitCode = await proc.exited;
      console.log('editor returned');
      if (exitCode !== 0) throw new Error(`${textEditor} exited with code ${exitCode}`);
    } else {

      await new Promise<void>(async (resolve, reject) => {
        const proc = await open(tmpPath);
        proc.on('error', reject);
        proc.on('close', () => resolve());
      });
      console.log('Please close the changelog editor before continuing.');
      // Optionally, wait for user input here
    }

    // Read, filter, and write back to changelog
    const edited = await fs.readFile(tmpPath, 'utf8');
    const filtered = edited.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
    await fs.writeFile(changelogPath, filtered.trim() + '\n');
    await fs.unlink(tmpPath);
  }

  await editChangelogWithInstructions();
}

const actions = {
  updateVersion: {
    order: 1,
    message: 'Update version',
    hint: 'Create a new -SNAPSHOT version with a new version number, updating package.json and pom.xml.',
    async handler() {
      const currentVersion = await getVersion();
      const {nextVersion} = await Enquirer.prompt<{nextVersion: string}>({
        type: 'select',
        name: 'nextVersion',
        message: `Current version is ${currentVersion}. Select the version part to increment:`,
        choices: [
          { name: currentVersion.nextPatchSnapshot().toString(), message: `Patch (${currentVersion.nextPatchSnapshot()})`, },
          { name: currentVersion.nextMinorSnapshot().toString(), message: `Minor (${currentVersion.nextMinorSnapshot()})`, },
          { name: currentVersion.nextMajorSnapshot().toString(), message: `Major (${currentVersion.nextMajorSnapshot()})`, }
        ]
      });

      await ensureCleanGit();
      await updatePackageJsonVersion(nextVersion);
      await updatePomXmlVersion(nextVersion);
      await git.add(rootDir);
      await git.commit(`Bump version to ${nextVersion}`);
      console.log(`Version updated to ${nextVersion}`);
      return nextVersion;
    },
  },
  createRelease: {
    order: 2,
    message: 'Release',
    hint: [
      'Create a release from current SNAPSHOT version, followed by incrementing to a new SNAPSHOT version.',
      'Will create a commit and matching git tag for the release, followed by another commit to bump the version to a new SNAPSHOT.',
    ].join('\n'),
    async handler(params?: { push?: boolean }) {
      const currentVersion = await getVersion();
      if (!currentVersion.snapshot) {
        console.log('Current version is not a SNAPSHOT. Nothing to release.');
        return;
      }
      
      const releaseVersion = currentVersion.nonSnapshotVersion();
      await updatePackageJsonVersion(releaseVersion.toString());
      await updatePomXmlVersion(releaseVersion.toString());
      await createChangelog();
      await git.add(rootDir);
      await git.commit(`Release version ${releaseVersion}`);
      await git.addTag(releaseVersion.toString());
      await actions.updateVersion.handler();
    }
  }
}

async function main() {
  await ensureCleanGit();

  const {actionsToPerform} = await Enquirer.prompt<{actionsToPerform: Array<keyof typeof actions>, push: boolean}>({
    type: 'multiselect',
    message: 'Select actions to perform',
    name: 'actionsToPerform',
    choices: Object
      .entries(actions)
      .map(([key, action]) => ({
        name: key,
        message: action.message,
        hint: action.hint,
      }))
  });
  actionsToPerform.sort((a, b) => actions[a].order - actions[b].order);
  
  await git.addTag(GIT_BACKUP_TAG);
  for (const action of actionsToPerform) {
    await actions[action].handler();
  }
  await git.tag(['-d', GIT_BACKUP_TAG]);
  

  const {push} = await Enquirer.prompt<{push: boolean}>({
    type: 'confirm',
    name: 'push',
    message: 'Push changes?',
  });

  if (push) {
    await git.push();
    await git.pushTags();
  }
}

main().catch(e => {
  console.error(e.message);
  process.exit(1);
});
