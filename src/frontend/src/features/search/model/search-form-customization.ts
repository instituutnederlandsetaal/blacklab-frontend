import { readonly, shallowRef } from 'vue';

import type { Option } from '@/shared/utils/options';

export type SearchFormWithinControl = 'text' | 'range' | { type: 'select'; options: Option[] };

export type SearchFormWithinAttribute = {
	id: string;
	elementName: string;
	attributeName: string;
	control: SearchFormWithinControl;
	groupId?: string;
	insertBefore?: string;
	defaultDisplayName?: string;
	defaultDescription?: string;
};

type WithinCustomization = {
	includeElement?: (elementName: string) => boolean;
	includeAttribute?: (elementName: string, attributeName: string) => boolean;
};

export type SearchFormCustomization = {
	withinAttributes: SearchFormWithinAttribute[];
	within: WithinCustomization;
};

type SearchFormCustomizationApi = {
	addWithinAttribute(attribute: SearchFormWithinAttribute): void;
	configureWithin(customization: WithinCustomization): void;
};

export type SearchFormCustomizationCallback = (form: SearchFormCustomizationApi) => void;

const callbacks = shallowRef<readonly SearchFormCustomizationCallback[]>([]);
export const searchFormCustomizationCallbacks = readonly(callbacks);

export function registerSearchFormCustomization(callback: SearchFormCustomizationCallback): () => void {
	callbacks.value = [...callbacks.value, callback];
	return () => (callbacks.value = callbacks.value.filter(current => current !== callback));
}

export function resolveSearchFormCustomizations(callbacksToRun: readonly SearchFormCustomizationCallback[]): SearchFormCustomization {
	const customization: SearchFormCustomization = { withinAttributes: [], within: {} };
	const api: SearchFormCustomizationApi = {
		addWithinAttribute: attribute => customization.withinAttributes.push({ ...attribute }),
		configureWithin: within => Object.assign(customization.within, within),
	};
	for (const callback of callbacksToRun) {
		try {
			callback(api);
		} catch (error) {
			console.error('Error in search form customization callback:', error);
		}
	}
	return customization;
}
