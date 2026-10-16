import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePrefix = `${root.replaceAll('\\', '/')}/src/`;
const output = [];
for (const configFile of [path.join(root, 'vite.config.ts'), path.join(root, 'tooling/vite.callback.config.js')]) {
	const result = await build({ root, configFile, logLevel: 'warn', build: { write: false, sourcemap: false, reportCompressedSize: false } });
	output.push(...(Array.isArray(result) ? result : [result]).flatMap(output => output.output));
}
assert.ok(
	output.some(asset => asset.fileName === 'main.css'),
	'Missing main.css stylesheet referenced by the server template',
);
const chunks = output.filter(output => output.type === 'chunk');
const byFile = new Map(chunks.map(chunk => [chunk.fileName, chunk]));

function entry(suffix) {
	const chunk = chunks.find(chunk => chunk.facadeModuleId?.endsWith(suffix));
	assert.ok(chunk, `Missing bundle entry: ${suffix}`);
	return chunk.fileName;
}

function closure(entries) {
	const files = new Set();
	function visit(file) {
		if (files.has(file)) return;
		const chunk = byFile.get(file);
		assert.ok(chunk, `Missing imported bundle: ${file}`);
		files.add(file);
		chunk.imports.forEach(visit);
	}
	entries.forEach(visit);
	return [...files].map(file => byFile.get(file));
}

const main = entry('/app/entrypoint/main.ts');
const locale = entry('/locales/en-us.json?raw');
const pages = {
	global: closure([main]),
	index: closure([main, locale, entry('/pages/corpora/CorporaPage.vue')]),
	search: closure([main, locale, entry('/features/search/entrypoint.ts')]),
	article: closure([main, locale, entry('/features/article/entrypoint.ts')]),
	config: closure([main, locale, entry('/pages/config/entrypoint.ts')]),
	info: closure([main, locale, entry('/pages/info.ts')]),
};
const template = await readFile(path.join(root, '../main/webapp/WEB-INF/templates/index.vm'), 'utf8');
for (const stylesheet of new Set(pages.global.flatMap(chunk => [...chunk.viteMetadata.importedCss]))) {
	assert.ok(template.includes(`/js/${stylesheet}?`), `The server template is missing the application stylesheet ${stylesheet}`);
}
const search = /\/src\/(?:features\/(?:search|form|cql-query-builder|history)\/|pages\/search\/)/;
const article = /\/src\/(?:features|pages)\/article\//;
const config = /\/src\/pages\/config\//;
const heavy = /\/node_modules\/(?:monaco-editor|monaco-yaml|highcharts|highcharts-vue|@vue\/compiler-[^/]+|@vue\/devtools[^/]*)\//;

for (const [name, output] of Object.entries(pages)) {
	const modules = output.flatMap(chunk => Object.keys(chunk.modules));
	const forbidden = [heavy, ...(name === 'search' ? [] : [search]), ...(name === 'article' ? [] : [article]), ...(name === 'config' ? [] : [config])];
	const leaks = modules.filter(id => forbidden.some(pattern => pattern.test(id)));
	assert.deepEqual(leaks, [], `${name} eagerly loads another feature:\n${leaks.join('\n')}`);
}

const callback = closure([entry('/app/entrypoint/callback.ts')]);
assert.equal(callback.length, 1, 'OIDC callback must be standalone');
assert.ok(
	callback.flatMap(chunk => Object.keys(chunk.modules)).every(id => !id.startsWith(sourcePrefix) || id.endsWith('/app/entrypoint/callback.ts')),
	'OIDC callback loads application code',
);

if (process.argv.includes('--report')) {
	console.table(
		Object.fromEntries(
			Object.entries(pages).map(([name, output]) => [
				name,
				{
					files: output.length,
					'JS KiB': Math.round(output.reduce((size, chunk) => size + Buffer.byteLength(chunk.code), 0) / 1024),
					'gzip KiB': Math.round(output.reduce((size, chunk) => size + gzipSync(chunk.code).length, 0) / 1024),
				},
			]),
		),
	);
}
