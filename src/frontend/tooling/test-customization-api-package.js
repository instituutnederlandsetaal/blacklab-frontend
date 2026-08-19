import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const declarationPath = join(frontendRoot, 'dist/customization-api/index.d.ts');
const packagePath = dirname(declarationPath);
const typescriptCli = join(frontendRoot, 'node_modules/typescript/bin/tsc');

function run(command, args, cwd, environment = {}) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: 'utf8',
		env: { ...process.env, ...environment },
	});

	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error([`Command failed: ${command} ${args.join(' ')}`, result.stdout, result.stderr].filter(Boolean).join('\n'));
	}

	return result.stdout;
}

function runNpm(args, cwd) {
	const environment = {
		npm_config_audit: 'false',
		npm_config_fund: 'false',
		npm_config_ignore_scripts: 'true',
		npm_config_offline: 'true',
		npm_config_update_notifier: 'false',
	};
	const npmCli = process.env.npm_execpath;
	return npmCli ? run(process.execPath, [npmCli, ...args], cwd, environment) : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd, environment);
}

const tempRoot = await mkdtemp(join(tmpdir(), 'blacklab-frontend-customization-api-'));
try {
	const tempRelativeToFrontend = relative(resolve(frontendRoot), resolve(tempRoot));
	if (!isAbsolute(tempRelativeToFrontend) && !tempRelativeToFrontend.startsWith('..')) {
		throw new Error(`Temporary consumer must be outside the repository: ${tempRoot}`);
	}

	await writeFile(join(tempRoot, 'package.json'), '{"private":true,"type":"module"}\n');
	const packedOutput = runNpm(['pack', packagePath, '--pack-destination', tempRoot, '--ignore-scripts', '--json'], tempRoot);
	const packed = JSON.parse(packedOutput);
	const packageInfo = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
	if (!packageInfo) throw new Error('npm pack produced no package');
	const tarballPath = join(tempRoot, packageInfo.filename);

	runNpm(['install', tarballPath, '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false'], tempRoot);

	const consumer = await readFile(new URL('./customization-api/consumer.js', import.meta.url), 'utf8');
	await writeFile(
		join(tempRoot, 'consumer.js'),
		consumer
			.replace('/// <reference path="../../dist/customization-api/index.d.ts" />', '/// <reference types="@instituutnederlandsetaal/blacklab-frontend-customization-api" />')
			.replaceAll('../../dist/customization-api/index.d.ts', '@instituutnederlandsetaal/blacklab-frontend-customization-api'),
	);
	await writeFile(
		join(tempRoot, 'tsconfig.json'),
		`${JSON.stringify(
			{
				compilerOptions: {
					allowJs: true,
					checkJs: true,
					lib: ['DOM', 'ES2023'],
					noEmit: true,
					skipLibCheck: false,
					strict: true,
					types: [],
				},
				files: ['consumer.js'],
			},
			null,
			2,
		)}\n`,
	);

	run(process.execPath, [typescriptCli, '-p', join(tempRoot, 'tsconfig.json')], tempRoot);
	console.log('Verified the packed customization API from an isolated strict JavaScript consumer.');
} finally {
	await rm(tempRoot, { recursive: true, force: true });
}
