import {resolve} from 'path';
import {defineConfig} from 'vitest/config';
export default defineConfig({
	resolve: {
		alias: {
			'@': resolve(__dirname, '../src/'),
			'@test': resolve(__dirname, './')
		}
	},
	onConsoleLog(log, type) { return true; },
})