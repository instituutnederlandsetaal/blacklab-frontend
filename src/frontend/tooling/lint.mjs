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
	{ label: 'Oxlint', command: executable('oxlint'), args: ['--config', 'tooling/oxlint.config.mts', '.'] },
];

if (await runChecks(checks)) {
	await runChecks([
		{ label: 'Knip', command: executable('knip'), args: ['--config', 'tooling/knip.json'] },
		{ label: 'abstraction heuristic', command: process.execPath, args: ['tooling/lint-abstractions.mjs'] },
	]);
}

async function runChecks(checks) {
	const results = await Promise.all(checks.map(runCheck));
	for (const result of results) {
		if (!result.stdout && !result.stderr) continue;
		process.stdout.write(`\n[${result.label}]\n`);
		if (result.stdout) process.stdout.write(result.stdout);
		if (result.stderr) process.stdout.write(result.stderr);
	}

	const failures = results.filter(result => result.code !== 0);
	if (!failures.length) return true;

	process.stderr.write(`\nLint failed: ${failures.map(result => result.label).join(', ')}.\n`);
	process.exitCode = 1;
	return false;
}

function runCheck(check) {
	return new Promise(resolve => {
		const child = spawn(check.command, check.args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', chunk => (stdout += chunk));
		child.stderr.on('data', chunk => (stderr += chunk));
		child.on('error', error => resolve({ ...check, code: 1, stdout, stderr: `${stderr}${error.stack ?? error.message}\n` }));
		child.on('close', code => resolve({ ...check, code: code ?? 1, stdout, stderr }));
	});
}
