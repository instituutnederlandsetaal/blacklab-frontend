import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Elements } = require('@boundaries/elements');

const rootPath = 'C:/Users/koen/workspace/blacklab-frontend/src/frontend';
const probeFile = `${rootPath}/src/pages/search/boundaries-probe.ts`;
const appFile = `${rootPath}/src/app/plugins/installCorpusData.ts`;

const FS_LAYERS = ['app', 'processes', 'pages', 'widgets', 'features', 'entities', 'shared'];

const descriptors = [
	...FS_LAYERS.map(layer => ({
		type: layer,
		pattern: `src/${layer}/!(_*){,/*}`,
		mode: 'folder',
		capture: ['slices'],
	})),
	...FS_LAYERS.map(layer => ({
		type: `gm_${layer}`,
		pattern: `src/${layer}/_*`,
		mode: 'folder',
		capture: ['slices'],
	})),
];

const elements = new Elements({ rootPath });
const matcher = elements.getMatcher(descriptors, { rootPath });

const describeImport = (label, source, to) => {
	const dependency = {
		from: probeFile,
		to,
		source,
		kind: 'value',
	};

	console.log(`\n=== ${label} ===`);
	console.log(JSON.stringify({
		source,
		from: matcher.describeElement(probeFile),
		to: matcher.describeElement(to),
		dependency: matcher.describeDependency(dependency),
		selectorMatch: matcher.getDependencySelectorMatching(dependency, {
			from: 'pages',
			to: 'app',
		}),
	}, null, 2));
};

console.log('=== descriptors ===');
console.log(JSON.stringify(descriptors, null, 2));

describeImport('relative invalid import', '../../app/plugins/installCorpusData', appFile);
describeImport('alias invalid import', '@/app/plugins/installCorpusData', appFile);