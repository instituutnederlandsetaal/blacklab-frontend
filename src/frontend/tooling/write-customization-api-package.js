import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const frontendPackage = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const output = new URL('../dist/customization-api/package.json', import.meta.url);

await writeFile(
	output,
	`${JSON.stringify(
		{
			name: '@instituutnederlandsetaal/blacklab-frontend-customization-api',
			version: frontendPackage.version,
			description: 'Type definitions for BlackLab Frontend corpus customization scripts',
			types: 'index.d.ts',
			files: ['index.d.ts'],
			license: frontendPackage.license,
			repository: 'https://github.com/instituutnederlandsetaal/blacklab-frontend',
			private: false,
		},
		null,
		2,
	)}\n`,
);

console.log(`Wrote customization API package metadata under ${frontendRoot}dist/customization-api`);
