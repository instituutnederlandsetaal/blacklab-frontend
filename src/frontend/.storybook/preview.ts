/// <reference types="vite/client" />

import '@/bootstrap.less';
import '@/global.scss';
import 'floating-vue/dist/style.css';

import { setup, type Preview } from '@storybook/vue3-vite';
import { defineComponent } from 'vue';

import { createMockI18n } from '../test/mocks/i18n';

const DebugStub = defineComponent({
	name: 'debug',
	template: '<span />',
});

setup(app => {
	app.use(createMockI18n());
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
