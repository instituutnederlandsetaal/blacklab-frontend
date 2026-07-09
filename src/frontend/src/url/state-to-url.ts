import URI from 'urijs';

import type { BlackLabParameters } from '@/features/form/model/types/blacklab-params';
import type * as InterfaceStore from '@/features/search/model/form/interface-state';
import type * as QueryStore from '@/features/search/model/query-state';
import type * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import type * as ViewStore from '@/features/search/model/results/view-state';

import { cleanQueryParams } from '@/shared/api/lib/api-utils';

type UrlStateSlice = {
	query: QueryStore.ModuleRootState;
	interface: InterfaceStore.ModuleRootState;
	global: GlobalResultsStore.ModuleRootState;
	views: ViewStore.ModuleRootState;
};

export type UrlTransformInput = {
	scopedFormQuery?: Record<string, string | string[]> | null;
	patt?: string | null;
	filter?: string | null;
	gapValue?: string | null;
	searchfield?: string | null;
	state: UrlStateSlice;
};

export type UrlTransformOutput = {
	page: 'root' | 'search' | 'article';
	url: string;
	fullUrl: string;
	isTruncated: boolean;
};

function getContextSegments(contextUrl: string): string[] {
	return new URI(contextUrl).segmentCoded().filter(s => !!s);
}

function toRelativeUrl(contextUrl: string, pathSegments: string[], queryParams: Record<string, unknown>): string {
	return new URI().segment(getContextSegments(contextUrl).concat(pathSegments)).host('').protocol('').port('').search(cleanQueryParams(queryParams)).toString();
}

export type SearchPageQueryParamsInput = {
	query: QueryStore.ModuleRootState;
	interface: InterfaceStore.ModuleRootState;
	blacklabParams: BlackLabParameters;
	view: ViewStore.ViewRootState;
};

export function getSubmittedInterfaceState({ query, interface: interfaceState }: Pick<SearchPageQueryParamsInput, 'query' | 'interface'>): Partial<InterfaceStore.ModuleRootState> {
	const shared = {
		viewedResults: undefined,
		activeAnnotationTab: interfaceState.activeAnnotationTab || undefined,
		activeFilterTab: interfaceState.activeFilterTab || undefined,
	};

	if (query.form === 'explore') {
		return {
			...shared,
			form: 'explore',
			exploreMode: query.subForm,
		};
	}

	if (query.form === 'search') {
		return {
			...shared,
			form: 'search',
			patternMode: query.subForm,
		};
	}

	// new form is active, or no form is active at all (no query submitted?)
	// return the live state instead of the snapshot.
	return {
		...shared,
		form: interfaceState.form,
		exploreMode: interfaceState.exploreMode,
		patternMode: interfaceState.patternMode,
	};
}

export function corpusSearchUrl(contextUrl: string, indexId: string): string {
	return toRelativeUrl(contextUrl, [indexId, 'search'], {});
}
