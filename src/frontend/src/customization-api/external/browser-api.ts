import type { CustomizationRegistry } from '../registry';
import type { BlackLabFrontendCustomizationApi } from './external-api';

/** Create the browser-facing customization API installed as `window.frontend`. */
export function createExternalCustomizationApi(registry: CustomizationRegistry): BlackLabFrontendCustomizationApi {
	const api = {
		customize: customization => registry.applyLegacyCustomization(customization),
		customizeSearchForm: customization => registry.registerForm(customization),
		customizeSearchResults: customization => registry.registerResults(customization),
	} satisfies BlackLabFrontendCustomizationApi;
	return api;
}
