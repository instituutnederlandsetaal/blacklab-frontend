import { defineConfig } from 'oxfmt';

export default defineConfig({
	sortImports: {
		customGroups: [
			{
				elementNamePattern: ['**/*.vue'],
				groupName: 'vue_components',
				modifiers: [],
			},
		],
		groups: ['side_effect', 'side_effect_style', 'builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'vue_components'],
		internalPattern: ['@/', '~/', '\\./'],
		newlinesBetween: true,
	},
	arrowParens: 'avoid',
	bracketSameLine: false,
	bracketSpacing: true,
	endOfLine: 'lf',
	jsdoc: false, // don't format jsdoc comments
	printWidth: 200, // don't care about long lines
	singleQuote: true,
	sortPackageJson: false,
	tabWidth: 2,
	useTabs: true,
	// keep statements in <script> and <style> at 0 indentation instead of prefixing 1 level
	vueIndentScriptAndStyle: false,
	embeddedLanguageFormatting: 'auto',
});
