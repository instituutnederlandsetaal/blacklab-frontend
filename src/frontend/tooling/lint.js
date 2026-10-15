#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run lint through npm: npm run lint');

const npmCheck = (label, bin, args) => ({ label, command: process.execPath, args: [npmCli, 'exec', '--no', '--', bin, ...args] });
const nodeCheck = (label, file) => ({ label, command: process.execPath, args: [file] });

const checks = [
	npmCheck('application types', 'vue-tsc', ['--noEmit', '-p', 'tsconfig.app.json']),
	npmCheck('test and Storybook types', 'vue-tsc', ['--noEmit', '-p', 'tsconfig.tests.json']),
	npmCheck('tooling types', 'tsc', ['--noEmit', '-p', 'tsconfig.node.json']),
	npmCheck('schema types', 'tsc', ['--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'esnext', '--module', 'esnext', 'assets/blf-schema.ts']),
	npmCheck('Oxlint', 'oxlint', ['--config', 'tooling/oxlint.config.ts', '.']),
	nodeCheck('locale bundles', 'tooling/compare-locale-bundles.js'),
	npmCheck('Knip', 'knip', ['--config', 'tooling/knip.json']),
	nodeCheck('abstraction heuristic', 'tooling/lint-abstractions.js'),
];

await runChecks(checks);

async function runChecks(checks) {
	const results = [];
	// Keep checks sequential to limit peak memory use and keep diagnostics grouped.
	for (const check of checks) results.push(await runCheck(check));

	const failures = results.filter(result => result.code !== 0);
	if (!failures.length) return;

	process.stderr.write(`\nLint failed: ${failures.map(result => result.label).join(', ')}.\n`);
	process.exitCode = 1;
}

function runCheck(check) {
	process.stdout.write(`\n[${check.label}]\n`);
	return new Promise(resolve => {
		const child = spawn(check.command, check.args, { cwd: root, env: process.env, stdio: 'inherit' });
		child.on('error', error => {
			process.stderr.write(`${error.stack ?? error.message}\n`);
			resolve({ ...check, code: 1 });
		});
		child.on('close', code => resolve({ ...check, code: code ?? 1 }));
	});
}
