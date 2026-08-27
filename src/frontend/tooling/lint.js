#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executableExtension = process.platform === 'win32' ? '.cmd' : '';
const executable = name => path.join(root, 'node_modules', '.bin', `${name}${executableExtension}`);

const checks = [
	{ label: 'application types', command: executable('vue-tsc'), args: ['--noEmit', '-p', 'tsconfig.app.json'] },
	{ label: 'test and Storybook types', command: executable('vue-tsc'), args: ['--noEmit', '-p', 'tsconfig.tests.json'] },
	{ label: 'tooling types', command: executable('tsc'), args: ['--noEmit', '-p', 'tsconfig.node.json'] },
	{
		label: 'schema types',
		command: executable('tsc'),
		args: ['--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--target', 'esnext', '--module', 'esnext', 'assets/blf-schema.ts'],
	},
	{ label: 'Oxlint', command: executable('oxlint'), args: ['--config', 'tooling/oxlint.config.ts', '.'] },
];

if (await runChecks(checks)) {
	await runChecks([
		{ label: 'Knip', command: executable('knip'), args: ['--config', 'tooling/knip.json'] },
		{ label: 'abstraction heuristic', command: process.execPath, args: ['tooling/lint-abstractions.js'] },
	]);
}

async function runChecks(checks) {
	const results = [];
	for (const check of checks) results.push(await runCheck(check));

	const failures = results.filter(result => result.code !== 0);
	if (!failures.length) return true;

	process.stderr.write(`\nLint failed: ${failures.map(result => result.label).join(', ')}.\n`);
	process.exitCode = 1;
	return false;
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
