#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const checkIndex = args.indexOf('--check-negative');
const checkNegative = checkIndex >= 0;
if (checkNegative) args.splice(checkIndex, 1);
const [base = 'HEAD', target] = args;
const workingDirectory = fileURLToPath(new URL('..', import.meta.url));

if (args.length > 2) {
	process.stderr.write('Usage: node tooling/source-loc-diff.js [--check-negative] [base] [target]\n');
	process.exit(2);
}

const gitArgs = ['diff', '--numstat', '--no-renames', base];
if (target) gitArgs.push(target);
gitArgs.push('--', 'src');

const runGit = gitArgs => {
	const result = spawnSync('git', gitArgs, { cwd: workingDirectory, encoding: 'utf8' });
	if (result.status === 0) return result.stdout;
	process.stderr.write(result.stderr);
	process.exit(result.status ?? 1);
};

const sourceFile = file => /\.(?:[cm]?[jt]sx?|vue|s?css)$/.test(file) && !/(?:^|\/)(?:test|tests|__tests__|stories|__snapshots__)(?:\/|$)/.test(file) && !/\.(?:test|spec|stories)\./.test(file);

const totals = runGit(gitArgs)
	.trim()
	.split('\n')
	.filter(Boolean)
	.map(line => line.split('\t'))
	.filter(([, , file]) => sourceFile(file))
	.reduce(
		(totals, [added, deleted]) => ({
			added: totals.added + Number(added),
			deleted: totals.deleted + Number(deleted),
		}),
		{ added: 0, deleted: 0 },
	);

if (!target) {
	const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z', '--', 'src']).split('\0').filter(sourceFile);
	totals.added += untracked.reduce((total, file) => {
		const contents = readFileSync(resolve(workingDirectory, file), 'utf8');
		return total + (contents ? contents.split('\n').length - Number(contents.endsWith('\n')) : 0);
	}, 0);
}

const net = totals.added - totals.deleted;
process.stdout.write(`source LOC: +${totals.added} -${totals.deleted} = ${net > 0 ? '+' : ''}${net}\n`);
if (checkNegative && net >= 0) process.exitCode = 1;
