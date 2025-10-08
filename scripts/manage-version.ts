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

const git = simpleGit();
const rootDir = (await (Bun.$`git rev-parse --show-toplevel`).text()).trim();
const packageJsonPath = path.join(rootDir, 'src/frontend/package.json');
const pomXmlPath = path.join(rootDir, 'pom.xml');
const changelogPath = path.join(rootDir, 'CHANGELOG.md');
const textEditor: string|undefined = (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.TERM_PROGRAM === 'vscode') ? 'code --wait' : (await git.getConfig('core.editor')).value || undefined;
const GIT_BACKUP_TAG = 'VERSION_BUMP_CHECKPOINT';

let backupTagCreated = false;
let tagCreated: string | undefined = undefined;

/**
 * Restores the git repository to the initial checkpoint created at the start of the script.
 * This is called when the user interrupts the process or when an error occurs.
 */
async function restoreToCheckpoint() {
  if (!backupTagCreated) return;

  try {
    if (tagCreated) {
      console.log(`Removing created tag: ${tagCreated}`);
      await git.tag(['-d', tagCreated]);
      tagCreated = undefined;
    }

    if (backupTagCreated) {
      console.log('\nRestoring to git checkpoint...');
      await git.reset(['--hard', GIT_BACKUP_TAG]);
      console.log('Git state restored to initial checkpoint.');
      await cleanupBackupTag();
    }
  } catch (error) {
    console.error('Failed to restore git checkpoint:', error);
  }
}

/**
 * Cleans up the backup tag when operations complete successfully.
 */
async function cleanupBackupTag() {
  if (!backupTagCreated) return;

  try {
    await git.tag(['-d', GIT_BACKUP_TAG]);
    backupTagCreated = false;
  } catch (error) {
    // Ignore errors when cleaning up backup tag
  }
}

// Handle user interruption (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('\nOperation interrupted by user.');
  await restoreToCheckpoint();
  process.exit(130); // Standard exit code for SIGINT
});

process.on('SIGTERM', async () => {
  console.log('\nOperation terminated.');
  await restoreToCheckpoint();
  process.exit(143); // Standard exit code for SIGTERM
});

/**
 * Wrapper for Enquirer prompts to handle user cancellation gracefully.
 * If the user presses Ctrl+C during a prompt, it will restore the git checkpoint.
 */
async function safePrompt<T>(promptConfig: any): Promise<T> {
  try {
    return await Enquirer.prompt<T>(promptConfig);
  } catch (error) {
    // Handle Ctrl+C during prompts
    if (error && typeof error === 'object' && 'message' in error && error.message === '') {
      console.log('\nOperation cancelled by user.');
      await restoreToCheckpoint();
      process.exit(130);
    }
    throw error;
  }
}

class Version {
  private static readonly versionRegex = /^(\d+)\.(\d+)\.(\d+)(-SNAPSHOT)?$/;

  protected constructor(public major: number, public minor: number, public patch: number, public snapshot: boolean) {}
  static fromString(version: string): Version {
    const m = version.match(Version.versionRegex);
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

  static isVersionString(str: string): boolean {
    return Version.versionRegex.test(str);
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
  const versionTags = (await git.tags(['--sort=creatordate', '--merged'])).all.filter(Version.isVersionString);
  if (!versionTags.length) {
    throw new Error('No previous release tag found. Cannot create changelog.');
  }
  console.log(`Generating changelog from ${versionTags[versionTags.length-1]} to HEAD`);
  const log = (await git.log({ from: versionTags[versionTags.length-1], to: 'HEAD' })).all
    .map(c => [`# ${c.date} (${c.author_name}) <${c.hash}>`, c.message, c.body].join('\n'))
    .join('\n\n');

  await fs.writeFile(changelogPath, log);

  // 5. Let user edit as before
  async function editChangelogWithInstructions() {
    // Prepare temp file with instructions and current changelog
    const tmpPath = path.join(os.tmpdir(), `changelog-edit-${Date.now()}.md`);
    const instructions = await fs.readFile(path.join(__dirname, 'changelog_instructions.md'), 'utf8');
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
      console.log('Waiting for you to close the changelog before continuing.');
      await new Promise<void>(async (resolve, reject) => {
        const proc = await open(tmpPath);
        proc.on('error', reject);
        proc.on('close', () => resolve());
      });
    }

    // Read, filter, and write back to changelog
    const edited = await fs.readFile(tmpPath, 'utf8');
    const filtered = edited.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');
    await fs.writeFile(changelogPath, filtered.trim() + '\n');
    await fs.unlink(tmpPath);
  }

  await editChangelogWithInstructions();
}

const actions = {
  updateVersion: {
    order: 1,
    message: 'Update SNAPSHOT Version',
    hint: 'Create a new -SNAPSHOT version (prior to release).',
    async handler() {
      const currentVersion = await getVersion();
      const {nextVersion} = await safePrompt<{nextVersion: string}>({
        type: 'select',
        name: 'nextVersion',
        message: `Current version is ${currentVersion}. Select the version part to increment:`,
        choices: [
          { name: currentVersion.nextPatchSnapshot().toString(), message: `Patch (${currentVersion.nextPatchSnapshot()})`, },
          { name: currentVersion.nextMinorSnapshot().toString(), message: `Minor (${currentVersion.nextMinorSnapshot()})`, },
          { name: currentVersion.nextMajorSnapshot().toString(), message: `Major (${currentVersion.nextMajorSnapshot()})`, }
        ]
      });

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
    message: 'Create Release',
    hint: 'Create a release from current SNAPSHOT version.',
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
      tagCreated = releaseVersion.toString();
      await actions.updateVersion.handler();
    }
  }
}

async function main() {
  await ensureCleanGit();

  const {actionsToPerform} = await safePrompt<{actionsToPerform: Array<keyof typeof actions>, push: boolean}>({
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

  // Create backup checkpoint
  await git.addTag(GIT_BACKUP_TAG);
  backupTagCreated = true;

  try {
    for (const action of actionsToPerform) {
      await actions[action].handler();
    }

    const {push} = await safePrompt<{push: boolean}>({
      type: 'confirm',
      name: 'push',
      message: 'Push changes?',
    });

    if (push) {
      await git.push();
      await git.pushTags();
    }

    // Clean up backup tag on success
    await cleanupBackupTag();

  } catch (error) {
    console.error('\nAn error occurred during execution:', error);
    throw error; // Re-throw to maintain error exit code, run cleanup in main catch
  }
}

main().catch(async e => {
  console.error('\nScript failed:', e.message);

  // Try to restore checkpoint if an error occurred
  await restoreToCheckpoint();

  process.exit(1);
});
