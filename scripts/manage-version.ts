#!/usr/bin/env bun

// manage-version.js: Interactive CLI for project version management and release notes generation.

if (!('Bun' in globalThis)) {
  console.error('\x1b[31m%s\x1b[0m', 'This script requires Bun to run. Please install Bun from https://bun.sh');
  process.exit(1);
}


import Enquirer from 'enquirer';
import simpleGit from 'simple-git';
import fssync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import open from 'open';
import os from 'os';

import Version from './version.ts';

const git = simpleGit();
const rootDir = (await (Bun.$`git rev-parse --show-toplevel`).text()).trim();
const frontendPath = path.join(rootDir, 'src/frontend/');
const textEditor: string|undefined = (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.TERM_PROGRAM === 'vscode') ? 'code --wait' : (await git.getConfig('core.editor')).value || undefined;
const GIT_BACKUP_TAG = 'VERSION_BUMP_CHECKPOINT';
const RELEASE_NOTES_DIR = path.join(rootDir, 'docs/src/060_release_notes/');
const RELEASE_NOTES_TEMPLATE_FILE = path.join(__dirname, 'release_notes.template.md');

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
async function safePrompt<T>(promptConfig: Parameters<(typeof Enquirer<T>)['prompt']>[0]): Promise<T> {
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

async function getVersion(): Promise<Version> {
  // npm returns version as "version" (with quotes) -> remove quotes
  const npmVersion = await (Bun.$`cd ${frontendPath} && npm pkg get version`).text().then(v => v.replaceAll('"', '')).then(v => Version.fromString(v.trim()));
  const pomVersion = await (Bun.$`cd ${rootDir} && mvn help:evaluate -Dexpression=project.version -q -DforceStdout`).text().then(v => Version.fromString(v.trim()));
  if (!Version.equals(npmVersion, pomVersion)) console.warn(`inconsistent versions! NPM: ${npmVersion} - POM: ${pomVersion}`);
  return Version.highestVersion(npmVersion, pomVersion);
}

async function setVersion(newVersion: Version) {
  await (Bun.$`cd ${frontendPath} && npm version ${newVersion.toString()} --no-git-tag-version --silent`.quiet());
  await (Bun.$`cd ${rootDir} && mvn versions:set -DnewVersion=${newVersion.toString()} -DgenerateBackupPoms=false`.quiet());
}

async function ensureCleanGit(): Promise<void> {
  const status = await git.status();
  if (!status.isClean()) {
    throw new Error('You have uncommitted changes. Please commit or stash them first.');
  }
}

async function getGitLogSinceLastVersion(): Promise<string> {
  // 1. Find the latest non-SNAPSHOT version tag
  const versionTags = (await git.tags(['--sort=creatordate', '--merged'])).all.filter(v => Version.isVersionString(v) && !Version.fromString(v).snapshot);
  if (!versionTags.length) {
    throw new Error('No previous release tag found. Cannot get changelog.');
  }
  console.log(`Generating changelog from ${versionTags[versionTags.length-1]} to HEAD`);
  // Retrieve git log between that tag and HEAD
  const log = (await git.log({ from: versionTags[versionTags.length-1], to: 'HEAD' })).all
    .map(c => [`# ${c.date} (${c.author_name}) <${c.hash}>`, c.message, c.body].join('\n'))
    .join('\n\n');
  return log;
}

async function spawnEditorForFileAndAwaitExit(filePath: string): Promise<void> {
  if (textEditor) {
    const proc = Bun.spawn({
      cmd: ['sh', '-c', `${textEditor} '${filePath}'`],
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) throw new Error(`${textEditor} exited with code ${exitCode}`);
  } else {
    console.log('Waiting for you to save the file and close the editor before continuing...');
    await new Promise<void>(async (resolve, reject) => {
      const proc = await open(filePath);
      proc.on('error', reject);
      proc.on('close', () => resolve());
    });
  }
}


/**
 * Open an editor for the user to modify/add release notes, return the final content.
 * @param version The version for which release notes are being created.
 * @param gitLog The raw git log for the user to edit. Instructions will be prepended.
 */
async function promptUserForReleaseNotes(version: Version, gitLog: string): Promise<string> {
  // Prepare temp file with instructions and current changelog
  const tmpPath = path.join(os.tmpdir(), `release-notes-draft-${Date.now()}.md`);
  const template = await fs.readFile(RELEASE_NOTES_TEMPLATE_FILE, 'utf8');
  const initialContents = `# ${version.toString()}\n\n` + template + `\n<!--\n${gitLog}\n-->`;
  await fs.writeFile(tmpPath, initialContents);

  // Let user edit, naively check contents
  let edited: string;
  while (true) {
    await spawnEditorForFileAndAwaitExit(tmpPath);
    edited = await fs.readFile(tmpPath, 'utf8');
    
    let warning: string = '';
    if (edited === initialContents) { 
      warning = 'Warning: File was not edited.'; 
    } else if (edited.includes('<!--') || edited.includes('-->')) { 
      warning = 'Warning: File still contains instructions/comments.';
    }

    if (warning) {
      const {ok} = await safePrompt<{ok: boolean}>({
        type: 'confirm',
        name: 'ok',
        message: `${warning}. Use anyway?`,
        initial: false,
      });
      if (!ok) continue;
    }
    break;
  }

  await fs.unlink(tmpPath);
  return edited;
}

function getReleaseNotesFile(version: Version): string {
  if (!fssync.existsSync(RELEASE_NOTES_DIR)) {
    throw new Error(`Release notes directory does not exist: ${RELEASE_NOTES_DIR}\n Please fix the ${__filename} script.`);
  }
  return path.join(RELEASE_NOTES_DIR, `${version}.md`);
}

async function createReleaseNotes() {
  const currentVersion = await getVersion();
  const rawChangelog = await getGitLogSinceLastVersion();
  const releaseNotes = await promptUserForReleaseNotes(currentVersion, rawChangelog);

  const finalLocation = getReleaseNotesFile(currentVersion);
  console.log(`Writing changelog to ${finalLocation}`);
  await fs.writeFile(finalLocation, releaseNotes.trim() + '\n');
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

      await setVersion(Version.fromString(nextVersion));
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
      await setVersion(releaseVersion);
      await createReleaseNotes();
      await git.add(rootDir);
      await git.commit(`Release version ${releaseVersion}`);
      await git.addTag(releaseVersion.toString());
      tagCreated = releaseVersion.toString();
      await actions.updateVersion.handler();
    }
  },
  cleanupAfterFailedRun: {
    order: -1,
    message: 'Cleanup after failed run',
    hint: 'Restore git state to before running this script.',
    async handler() {
      await git.tags(['--sort=creatordate', '--merged']).then(tags => {
        for (const tag of tags.all) {
          if (Version.isVersionString(tag)) { tagCreated = tag; } // a version newer than the last backup tag
          backupTagCreated = tag === GIT_BACKUP_TAG;
          if (backupTagCreated) { break; } // found the backup tag, stop going further
        }
      });
      if (!backupTagCreated) {
        console.log('No backup tag found. Nothing to clean up.');
        return;
      }

      const {ok} = await safePrompt<{ok: boolean}>({
        type: 'confirm',
        name: 'ok',
        message: `Found a backup tag${tagCreated ? ` and a version tag ${tagCreated}` : ''}. Delete tags and Restore to checkpoint now?`,
        initial: true,
      });
      if (ok) {
        restoreToCheckpoint();
      } else {
        console.log('Leaving git state as is. Please restore manually if needed.');
      }
    
    }
  }
}

async function main() {
  await ensureCleanGit();

  const actionsToPerform = await safePrompt<{actionsToPerform: Array<keyof typeof actions>, push: boolean}>({
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
  })
  .then(res => res.actionsToPerform.map(a => actions[a]))
  .then(r => r.sort((a, b) => a.order - b.order));
  

  if (actionsToPerform.includes(actions.cleanupAfterFailedRun)) {
    console.log('Running cleanup action... Ignoring other selected actions.');
    await actions.cleanupAfterFailedRun.handler();
    return;
  }

  // Create backup checkpoint
  await git.addTag(GIT_BACKUP_TAG);
  backupTagCreated = true;

  try {
    for (const action of actionsToPerform) {
      await action.handler();
    }

    // Clean up backup tag on success
    await cleanupBackupTag();

    const {push} = await safePrompt<{push: boolean}>({
      type: 'confirm',
      name: 'push',
      message: 'Push changes?',
    });

    if (push) {
      await git.push();
      await git.pushTags();
    }

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
