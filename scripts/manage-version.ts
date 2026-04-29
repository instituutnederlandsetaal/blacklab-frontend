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

const DEV_BRANCH = 'dev';
const MAIN_BRANCH = 'main';
const MAINTENANCE_BRANCH_PATT = /^v(\d+)-maintenance$/;

const rootDir = (await (Bun.$`git rev-parse --show-toplevel`).text()).trim();
const git = simpleGit(rootDir);
const frontendPath = path.join(rootDir, 'src/frontend/');
const textEditor: string|undefined = (Bun.env.VSCODE_GIT_IPC_HANDLE || Bun.env.TERM_PROGRAM === 'vscode') ? 'code --wait' : (await git.getConfig('core.editor')).value || undefined;
const RELEASE_NOTES_DIR = path.join(rootDir, 'docs/src/060_release_notes/');
const RELEASE_NOTES_TEMPLATE_FILE = path.join(__dirname, 'release_notes.template.md');




class BackupTagManager {
  public BACKUP_TAG_PREFIX = 'VERSION_BUMP_CHECKPOINT_';
  private backupTags: {[branchName: string]: string} = {};

  async tagAndEnter(branch: string): Promise<void> {
    await git.checkout(branch);
    await this.createBackupTagForCurrentBranch();
  }

  async createBackupTagForCurrentBranch(): Promise<string> {
    const branch = await git.branchLocal();
    if (branch.detached) {
      throw new Error('You are in a detached HEAD state. Please switch to a branch before running this script.');
    }
    const tagName = `${this.BACKUP_TAG_PREFIX}${branch.current}`;
    if (this.backupTags[branch.current]) return tagName;
    await git.addTag(tagName);
    this.backupTags[branch.current] = tagName;
    return tagName;
  }

  async restoreBackupTags() {
    for (const [branch, tag] of Object.entries(this.backupTags)) {
      console.log(`Restoring branch ${branch} to backup tag ${tag}...`);
      await git.checkout(branch);
      await git.reset(['--hard', tag]);
      console.log(`Deleting backup tag ${tag}...`);
      await git.tag(['-d', tag]);
    }
  }

  async cleanupBackupTags() {
    for (const tag of Object.values(this.backupTags)) {
      try {
        console.log(`Deleting backup tag ${tag}...`);
        await git.tag(['-d', tag]);
      } catch (error) {
        // Ignore errors when cleaning up backup tags
      }
    }
    this.backupTags = {};
  }

  public getTags(): string[] {
    return Object.values(this.backupTags);
  }
}
const tagManager = new BackupTagManager();


let releaseTag: string | undefined = undefined;
const additionalBranchesToPush: string[] = [];


async function checkPreconditions() {
  const status = await git.status();
  if (!status.isClean()) {
    throw new Error('You have uncommitted changes. Please commit or stash them first.');
  }
  const branch = await git.branchLocal();
  if (branch.detached) {
    throw new Error('You are in a detached HEAD state. Please switch to a branch before running this script.');
  }
  if (getMaintenanceBranchMajor(branch.current) == null) {
    throw new Error(`You must be a maintenance branch to run this script, e.g. 'v5-maintenance'`);
  }

}

async function gatherWorkspaceAndBranchInfo(): Promise<WorkspaceAndBranchInfo> {
  const maintenanceBranch = (await git.branchLocal()).current;
  if (!maintenanceBranch.match(MAINTENANCE_BRANCH_PATT)) {
    throw new Error(`Current branch ${maintenanceBranch} does not match maintenance branch pattern ${MAINTENANCE_BRANCH_PATT}. Please switch to a maintenance branch.`);
  }

  const devVersion = Version.fromString((await git.tags(['--sort=-creatordate', '--merged', DEV_BRANCH])).all.find(Version.isVersionString)!);
  const mainVersion = Version.fromString((await git.tags(['--sort=-creatordate', '--merged', MAIN_BRANCH])).all.find(Version.isVersionString)!);

  return {
    maintenance_branch: maintenanceBranch,
    maintenance_branch_version: await getVersion(), // read repo instead of tag, because we're in progress on a release

    main_branch: MAIN_BRANCH,
    main_branch_version: mainVersion,

    dev_branch: DEV_BRANCH,
    dev_branch_version: devVersion
  }
}

/**
 * Restores the git repository to the initial checkpoint created at the start of the script.
 * This is called when the user interrupts the process or when an error occurs.
 */
async function restoreToInitialState() {
  await tagManager.restoreBackupTags();

  try {
    if (releaseTag) {
      console.log(`Removing created tag: ${releaseTag}`);
      await git.tag(['-d', releaseTag]);
      releaseTag = undefined;
    }
  } catch (error) {
    console.error('Failed to restore git checkpoint:', error);
  }
}


// Handle user interruption (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('\nOperation interrupted by user.');
  await restoreToInitialState();
  process.exit(130); // Standard exit code for SIGINT
});

process.on('SIGTERM', async () => {
  console.log('\nOperation terminated.');
  await restoreToInitialState();
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
      await restoreToInitialState();
      process.exit(130);
    }
    throw error;
  }
}

/** Returns the major version number if branch is a v<major>-maintenance branch, otherwise null. */
function getMaintenanceBranchMajor(branch: string): number | null {
  const m = branch.match(MAINTENANCE_BRANCH_PATT);
  return m ? Number(m[1]) : null;
}

/** Returns true if no released tags with a higher major version exist than the given major. */
async function isLatestMajor(major: number): Promise<boolean> {
  const allTags = (await git.tags()).all;
  return !allTags
    .filter(t => Version.isVersionString(t))
    .map(t => Version.fromString(t))
    .filter(v => !v.snapshot)
    .some(v => v.major > major);
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

/** Return the absolute path to the release notes file for the given version. */
function getReleaseNotesFile(version: Version): string {
  if (!fssync.existsSync(RELEASE_NOTES_DIR)) {
    throw new Error(`Release notes directory does not exist: ${RELEASE_NOTES_DIR}\n Please fix the ${__filename} script.`);
  }
  return path.join(RELEASE_NOTES_DIR, `${version}.md`);
}

type WorkspaceAndBranchInfo = {
  maintenance_branch: string;
  maintenance_branch_version: Version;

  main_branch: string;
  main_branch_version: Version;
  
  dev_branch: string;
  dev_branch_version: Version;
}


/** Let the user edit/create release notes, then move them to the final location in the repo and return it. */
async function createReleaseNotes(): Promise<string> {
  const currentVersion = await getVersion();
  const rawChangelog = await getGitLogSinceLastVersion();
  const releaseNotes = await promptUserForReleaseNotes(currentVersion, rawChangelog);

  const finalLocation = getReleaseNotesFile(currentVersion);
  console.log(`Writing changelog to ${finalLocation}`);
  await fs.writeFile(finalLocation, releaseNotes.trim() + '\n');
  return finalLocation;
}

const actions = {
  updateVersion: {
    order: 1,
    message: 'Update SNAPSHOT Version',
    hint: 'Create a new -SNAPSHOT version (prior to release).',
    async handler(p: WorkspaceAndBranchInfo) {
      await tagManager.tagAndEnter(p.maintenance_branch);

      const {nextVersion} = await safePrompt<{nextVersion: string}>({
        type: 'select',
        name: 'nextVersion',
        message: `Current version is ${p.maintenance_branch_version}. Select the version part to increment:`,
        choices: [
          { name: p.maintenance_branch_version.nextPatchSnapshot().toString(), message: `Patch (${p.maintenance_branch_version.nextPatchSnapshot()})`, },
          { name: p.maintenance_branch_version.nextMinorSnapshot().toString(), message: `Minor (${p.maintenance_branch_version.nextMinorSnapshot()})`, },
          { name: p.maintenance_branch_version.nextMajorSnapshot().toString(), message: `Major (${p.maintenance_branch_version.nextMajorSnapshot()})`, }
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
    async handler(p: WorkspaceAndBranchInfo) {
      if (!p.maintenance_branch_version.snapshot) {
        console.log('Current version is not a SNAPSHOT. Nothing to release.');
        return;
      }

      await tagManager.tagAndEnter(p.maintenance_branch);

      const releaseVersion = p.maintenance_branch_version.nonSnapshotVersion();
      await setVersion(releaseVersion);
      const releaseNotesFile = await createReleaseNotes();
      await git.add(rootDir);
      await git.commit(`Release version ${releaseVersion}`);
      await git.addTag(releaseVersion.toString());
      releaseTag = releaseVersion.toString();

      // create next snapshot commit
      await actions.updateVersion.handler({...p, maintenance_branch_version: releaseVersion});


      // Merge the release notes file into dev (docs site is built from dev)
      const releaseNotesRelPath = path.relative(rootDir, releaseNotesFile);
      console.log(`\nMerging release notes to dev branch...`);
      
      await tagManager.tagAndEnter(p.dev_branch);
      await git.checkout([p.maintenance_branch, '--', releaseNotesRelPath]);
      await git.commit(`docs: Add release notes for ${releaseVersion}`);
      await tagManager.tagAndEnter(p.maintenance_branch); // move back to maintenance branch
      additionalBranchesToPush.push(p.maintenance_branch);


      // merge the release tag itself to main if it matches the major version of the current main branch
      if (p.main_branch_version.major === releaseVersion.major) {
        console.log(`\nMerging release tag ${releaseVersion} to main...`);
        await tagManager.tagAndEnter(p.main_branch);
        await git.merge([releaseVersion.toString(), '-m', `Merge release ${releaseVersion} to main`]);
        await git.checkout(p.maintenance_branch); // move back to maintenance branch
        additionalBranchesToPush.push(p.main_branch);
      } else {
        console.log(`\nSkipping main merge: ${releaseVersion} is not the latest major version.`);
      }
    }
  },
  cleanupAfterFailedRun: {
    order: -1,
    message: 'Cleanup after failed run',
    hint: 'Restore git state to before running this script.',
    async handler() {
      if (!tagManager.getTags().length) {
        console.log('No backup tag found. Nothing to clean up.');
        return;
      }

      const {ok} = await safePrompt<{ok: boolean}>({
        type: 'confirm',
        name: 'ok',
        message: `Found a backup tag${releaseTag ? ` and a version tag ${releaseTag}` : ''}. Delete tags and Restore to checkpoint now?`,
        initial: true,
      });
      if (ok) {
        await restoreToInitialState();
      } else {
        console.log('Leaving git state as is. You can now restore manually.');
      }
    }
  }
}

async function main() {
  await checkPreconditions();
  const versionAndBranchInfo = gatherWorkspaceAndBranchInfo();

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


  try {
    for (const action of actionsToPerform) {
      await action.handler(await versionAndBranchInfo);
    }

    // Clean up backup tag on success
    await tagManager.cleanupBackupTags();

    const {push} = await safePrompt<{push: boolean}>({
      type: 'confirm',
      name: 'push',
      message: 'Push changes?',
    });

    if (push) {
      await git.push();
      for (const branch of additionalBranchesToPush) {
        await git.push(['origin', branch]);
      }
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
  await restoreToInitialState();

  process.exit(1);
});
