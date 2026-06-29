import type { ObjectPlugin } from 'vue';

import { provideTranslate, useI18n } from './translate';
import type { Translate } from './types';

export type I18nPluginParts = {
	translate: Translate;
};

export type I18nPlugin = ObjectPlugin & I18nPluginParts;

export function createI18nPlugin(parts: I18nPluginParts): I18nPlugin {
	return {
		install(app) {
			provideTranslate(app, parts.translate);
		},
		...parts,
	};
}

export { provideTranslate, useI18n };
