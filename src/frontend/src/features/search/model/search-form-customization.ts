import { readonly, shallowRef } from 'vue';

import type { Corpus } from '@/app/state/useCorpusContext';
import type { BaseContainerNode, BaseFormNode, BuilderContainerNode, FormBuilder } from '@/features/form';
import type { searchFormIds } from '@/features/search/model/search-form-ids';
import type { SearchFormNodeConstructors } from '@/features/search/model/search-form-node-factory';
import type { Tagset } from '@/types/apptypes';

import type { Translate } from '@/shared/i18n';
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

type SearchFormConfigurationApi = {
	addWithinAttribute(attribute: SearchFormWithinAttribute): void;
	configureWithin(customization: WithinCustomization): void;
};

export type SearchFormConfigurationCallback = (form: SearchFormConfigurationApi) => void;

type SearchFormCustomContainerOptions = Pick<BaseContainerNode, 'class' | 'combine' | 'title' | 'variant'>;
type SearchFormCustomFormOptions = Pick<BaseFormNode, 'class' | 'title' | 'variant'>;

/** Short-lived access to a completed definition before FormRuntime is created. */
export type SearchFormCustomizationApi = SearchFormNodeConstructors & {
	corpus: Readonly<Corpus>;
	graph: FormBuilder;
	ids: typeof searchFormIds;
	newContainer(id: string, options?: SearchFormCustomContainerOptions): BuilderContainerNode;
	newForm(id: string, options?: SearchFormCustomFormOptions): BuilderContainerNode;
	tagset: Readonly<Tagset> | undefined;
	translate: Translate;
};

export type SearchFormCustomizationCallback = (form: SearchFormCustomizationApi) => void;

const callbacks = shallowRef<readonly SearchFormCustomizationCallback[]>([]);
export const searchFormCustomizationCallbacks = readonly(callbacks);

export function registerSearchFormCustomization(callback: SearchFormCustomizationCallback): () => void {
	callbacks.value = [...callbacks.value, callback];
	return () => (callbacks.value = callbacks.value.filter(current => current !== callback));
}

export function runSearchFormCustomizations(form: SearchFormCustomizationApi, callbacksToRun: readonly SearchFormCustomizationCallback[]): void {
	for (const callback of callbacksToRun) {
		try {
			callback(form);
		} catch (error) {
			console.error('Error in search form customization callback:', error);
		}
	}
}

export function resolveSearchFormCustomizations(callbacksToRun: readonly SearchFormConfigurationCallback[]): SearchFormCustomization {
	const customization: SearchFormCustomization = { withinAttributes: [], within: {} };
	const api: SearchFormConfigurationApi = {
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
