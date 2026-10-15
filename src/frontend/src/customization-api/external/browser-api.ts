import { computed, defineAsyncComponent, defineComponent, h, ref } from 'vue';

import type { CustomizationRegistry } from '../registry';
import type { BlackLabFrontendCustomizationApi } from './external-api';

/** Create the browser-facing customization API installed as `window.frontend`. */
export function createExternalCustomizationApi(registry: CustomizationRegistry): BlackLabFrontendCustomizationApi {
	const api = {
		vue: {
			computed,
			defineAsyncComponent,
			defineComponent,
			h,
			ref,
			async loadCompiler() {
				await import('vue/dist/vue.esm-bundler.js');
			},
		},
		customize: customization => registry.applyLegacyCustomization(customization),
		customizeSearchForm: customization => registry.registerForm(customization),
		customizeSearchResults: customization => registry.registerResults(customization),
	} satisfies BlackLabFrontendCustomizationApi;
	return api;
}
