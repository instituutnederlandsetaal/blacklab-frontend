#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

const args = process.argv.slice(2);
const checkIndex = args.indexOf('--check-negative');
const checkNegative = checkIndex >= 0;
if (checkNegative) args.splice(checkIndex, 1);
const [base = 'HEAD', target] = args;

if (args.length > 2) {
	process.stderr.write('Usage: node tooling/source-loc-diff.js [--check-negative] [base] [target]\n');
	process.exit(2);
}

const gitArgs = ['diff', '--numstat', '--no-renames', base];
if (target) gitArgs.push(target);
gitArgs.push('--', 'src');

const result = spawnSync('git', gitArgs, { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
if (result.status !== 0) {
	process.stderr.write(result.stderr);
	process.exit(result.status ?? 1);
}

const sourceFile = file =>
	/\.(?:[cm]?[jt]sx?|vue|s?css)$/.test(file) &&
	!/(?:^|\/)(?:test|tests|__tests__|stories|__snapshots__)(?:\/|$)/.test(file) &&
	!(/\.(?:test|spec|stories)\./.test(file));

const totals = result.stdout
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

const net = totals.added - totals.deleted;
process.stdout.write(`source LOC: +${totals.added} -${totals.deleted} = ${net > 0 ? '+' : ''}${net}\n`);
if (checkNegative && net >= 0) process.exitCode = 1;
