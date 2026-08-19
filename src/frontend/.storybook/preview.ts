/// <reference types="vite/client" />

import 'bootstrap/dist/css/bootstrap.css'; // Keep source maps in Vite/Storybook; production loads the copied stylesheet directly.
import '@/global.scss';
import 'floating-vue/dist/style.css';

import enUsBundle from '@assets/locales/en-us.json?raw';
import nlNlBundle from '@assets/locales/nl-nl.json?raw';
import zhCnBundle from '@assets/locales/zh-cn.json?raw';
import { setup, type Preview } from '@storybook/vue3-vite';
import { defineComponent } from 'vue';

import { createMockI18n } from '@test/mocks/i18n';

const DebugStub = defineComponent({
	name: 'debug',
	template: '<span />',
});

setup(app => {
	app.use(
		createMockI18n({
			locale: 'en-us',
			fallbackLocale: 'en-us',
			bundles: {
				'en-us': enUsBundle,
				'nl-nl': nlNlBundle,
				'zh-cn': zhCnBundle,
			},
		}),
	);
	app.component('debug', DebugStub);
	app.component('Debug', DebugStub);
});

const preview: Preview = {
	parameters: {
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},

		a11y: {
			// 'todo' - show a11y violations in the test UI only
			// 'error' - fail CI on a11y violations
			// 'off' - skip a11y checks entirely
			test: 'todo',
		},
	},
};

export default preview;
