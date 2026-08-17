import type { SearchFormAnnotationControl, SearchFormResolvedWithinControl } from '@/customization-api/external/external-api';

import type { Option } from '@/shared/utils/options';

/** An XML attribute filter ready to be added to a form. */
export type SearchFormWithinAttribute = {
	id: string;
	elementName: string;
	attributeName: string;
	control: SearchFormResolvedWithinControl;
	groupId?: string;
	insertBefore?: string;
	defaultDisplayName?: string;
	defaultDescription?: string;
};

/** Search form settings collected from configuration callbacks. */
export type SearchFormOverrides = {
	simpleAnnotationId?: string;
	extendedAnnotationIds?: string[];
	annotationControls: Record<string, Exclude<SearchFormAnnotationControl, 'auto'>>;
	advanced: {
		enabled?: boolean;
		annotationIds?: string[];
		defaultAnnotationId?: string;
	};
	metadataFieldIds?: string[];
	hiddenMetadataFieldIds?: string[];
	spanFilters: SearchFormWithinAttribute[];
	within: {
		enabled?: boolean;
		elements?: Option[];
		includeElement?: (elementName: string) => boolean;
		includeAttribute?: (elementName: string, attributeName: string) => boolean;
	};
	alignBy: {
		enabled?: boolean;
		elements?: Option[];
		defaultValue?: string;
	};
	explore: {
		searchAnnotationIds?: string[];
		defaultSearchAnnotationId?: string | null;
		groupAnnotationIds?: string[];
		defaultGroupAnnotationId?: string | null;
		annotationGroupLabelsVisible?: boolean;
		groupMetadataIds?: string[];
		defaultGroupMetadataId?: string | null;
		metadataGroupLabelsVisible?: boolean;
	};
	lexiconDatabase?: string;
};

/** Creates empty search form settings. */
export function createSearchFormOverrides(): SearchFormOverrides {
	return {
		annotationControls: {},
		advanced: {},
		spanFilters: [],
		within: {},
		alignBy: {},
		explore: {},
	};
}
