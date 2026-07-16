import { type OxlintConfig, type OxlintOverride } from 'oxlint';

// === START feature-sliced cross-layer config

const FS_LAYERS = ['app', 'processes', 'pages', 'features', 'widgets', 'entities', 'shared'] as const;
type Layer = (typeof FS_LAYERS)[number];
const MAX_RELATIVE_LAYER_IMPORT_DEPTH = 12;

const getUpperLayers = (layer: Layer) => FS_LAYERS.slice(0, FS_LAYERS.indexOf(layer));

const getRelativeLayerPatterns = (layer: Layer) =>
	Array.from({ length: MAX_RELATIVE_LAYER_IMPORT_DEPTH }, (_, index) => {
		const prefix = '../'.repeat(index + 1);

		return [`${prefix}${layer}`, `${prefix}${layer}/**`];
	}).flat();

const getRestrictedLayerImportPatterns = (layers: readonly Layer[]) => layers.flatMap(layer => [`@/${layer}`, `@/${layer}/**`, ...getRelativeLayerPatterns(layer)]);

// @ts-ignore unused var (keep around for future)
// oxlint-disable-next-line no-unused-vars
const getCrossLayerOverrides = (): OxlintOverride[] =>
	FS_LAYERS.filter(layer => getUpperLayers(layer).length > 0).map(layer => ({
		files: [`src/${layer}/**/*`],
		rules: {
			'eslint/no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: getRestrictedLayerImportPatterns(getUpperLayers(layer)),
							message: `Cross-layer imports from "${layer}" to higher layers are not allowed. Import only from "${layer}" or lower layers.`,
						},
					],
				},
			],
		},
	}));

const config: OxlintConfig = {
	ignorePatterns: ['storybook-static/**', 'dist/**', 'tmp-types/**', 'blf-schema.json'],
	// Plugins contain sets of rules/extensions that will be loaded/become available.
	// They're generally grouped by type of check they perform, e.g. 'typescript' for rules that involve typescript-specific things, 'vue' for rules specific to Vue files, etc.
	// the 'oxc' plugin is sort of the standard library of rules.
	plugins: ['typescript', 'oxc', 'vue', 'vitest'],
	jsPlugins: ['./lint-rules/no-use-in-computed.mjs'],
	categories: {
		// enables all rules in the "correctness" category.
		correctness: 'error',
	},
	env: {
		builtin: true,
	},
	options: {
		typeAware: true,
		typeCheck: true,
	},
	// Disable feature-sliced-design layer enforcement for now.

	// overrides: getCrossLayerOverrides(),
	rules: {
		'typescript/consistent-type-imports': [
			'error',
			{
				fixStyle: 'inline-type-imports',
				prefer: 'type-imports',
			},
		],
		'typescript/consistent-type-exports': 'error',
		'eslint/no-unused-vars': [
			'warn',
			{
				args: 'none',
				varsIgnorePattern: '^_.*', // allow unused vars if they start with underscore, e.g. _unused
			},
		],
		'typescript/await-thenable': 'off',
		'eslint/no-async-promise-executor': 'off',
		'eslint/no-debugger': 'warn',
		'eslint/no-console': [
			'warn',
			{
				allow: ['debug', 'info', 'warn', 'error'],
			},
		],
		'typescript/restrict-template-expressions': [
			'error',
			{
				allowArray: true,
			},
		],
		'vitest/require-mock-type-parameters': 'allow',
		'blacklab/no-use-in-computed': 'error',
	},
};

export default config;
