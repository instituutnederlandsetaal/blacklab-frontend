/// <reference types="vite/client" />

import 'bootstrap/dist/css/bootstrap.css';
import '../src/global.scss';
import 'floating-vue/dist/style.css';

import { setup, type Preview } from '@storybook/vue3-vite';

import { createMockI18n } from '../src/shared/i18n';

setup(app => {
	app.use(createMockI18n());
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
