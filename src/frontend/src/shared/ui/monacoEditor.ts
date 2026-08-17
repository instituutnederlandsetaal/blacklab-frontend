import 'monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching.js';
import 'monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard.js';
import 'monaco-editor/esm/vs/editor/contrib/comment/browser/comment.js';
import 'monaco-editor/esm/vs/editor/contrib/find/browser/findController.js';
import 'monaco-editor/esm/vs/editor/contrib/folding/browser/folding.js';
import 'monaco-editor/esm/vs/editor/contrib/hover/browser/hover.js';
import 'monaco-editor/esm/vs/editor/contrib/multicursor/browser/multicursor.js';
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js';
import 'monaco-editor/esm/vs/language/json/monaco.contribution.js';
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution.js';

import blfSchema from '@assets/blf-schema.json';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import editorWorkerUrl from 'monaco-editor/esm/vs/editor/editor.worker.js?worker&url';
import jsonWorkerUrl from 'monaco-editor/esm/vs/language/json/json.worker.js?worker&url';
import { configureMonacoYaml, type JSONSchema } from 'monaco-yaml';

import yamlWorkerUrl from './monacoYaml.worker?worker&url';

function createWorker(workerUrl: string): Worker {
	const url = new URL(workerUrl, window.location.href);
	if (url.origin === window.location.origin) return new Worker(url, { type: 'module' });

	// In development the frontend can be loaded by the Java server while Vite
	// serves assets from another origin. A same-origin module worker may still
	// import the Vite-hosted worker because the dev server enables CORS.
	const proxyUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(url.href)};`], { type: 'text/javascript' }));
	return new Worker(proxyUrl, { type: 'module' });
}

const monacoEnvironment: monaco.Environment = {
	getWorker(_moduleId, label) {
		switch (label) {
			case 'editorWorkerService':
				return createWorker(editorWorkerUrl);
			case 'json':
				return createWorker(jsonWorkerUrl);
			case 'yaml':
				return createWorker(yamlWorkerUrl);
			default:
				throw new Error(`Unsupported Monaco worker: ${label}`);
		}
	},
};
window.MonacoEnvironment = monacoEnvironment;

const schema = blfSchema as unknown as JSONSchema;
const schemaUri = 'inmemory://blacklab/schemas/blf-schema.json';

configureMonacoYaml(monaco, {
	schemas: [
		{
			fileMatch: ['**/*.blf.yaml'],
			schema,
			uri: schemaUri,
		},
	],
});

monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
	allowComments: true,
	schemas: [
		{
			fileMatch: ['**/*.blf.json'],
			schema,
			uri: schemaUri,
		},
	],
});

export default monaco;
