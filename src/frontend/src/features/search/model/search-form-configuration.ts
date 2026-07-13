import { computed, type ComputedRef } from 'vue';

import * as UIStore from '@/app/state/ui-state';

import type { Option } from '@/shared/utils/options';

export type SearchFormConfiguration = {
	simpleAnnotationId: string;
	extendedAnnotationIds: string[];
	metadataFieldIds: string[];
	within: {
		enabled: boolean;
		elements: Option[];
	};
	alignBy: {
		enabled: boolean;
		elements: Option[];
		defaultValue: string;
	};
	lexiconDatabase: string;
};

/**
 * Copy the legacy UI configuration used by the simple and extended search forms.
 * The returned value has no reactive references back to the legacy store.
 */
export function snapshotSearchFormConfiguration(state: UIStore.ModuleRootState): SearchFormConfiguration {
	return {
		simpleAnnotationId: state.search.simple.searchAnnotationId,
		extendedAnnotationIds: [...state.search.extended.searchAnnotationIds],
		metadataFieldIds: [...state.search.shared.searchMetadataIds],
		within: {
			enabled: state.search.shared.within.enabled,
			elements: state.search.shared.within.elements.map(element => ({ ...element })),
		},
		alignBy: {
			enabled: state.search.shared.alignBy.enabled,
			elements: state.search.shared.alignBy.elements.map(element => ({ ...element })),
			defaultValue: state.search.shared.alignBy.defaultValue,
		},
		lexiconDatabase: state.global.lexiconDb,
	};
}

/**
 * Integration boundary between the legacy customization API and the new form builder.
 * Snapshotting happens outside the builder's paused tracking section, so corpus customizations
 * can invalidate the definition and the URL restore can consume the latest shape.
 */
export function createLegacySearchFormConfiguration(): ComputedRef<SearchFormConfiguration> {
	return computed(() => snapshotSearchFormConfiguration(UIStore.getState()));
}
