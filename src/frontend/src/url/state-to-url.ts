import URI from 'urijs';

import type * as InterfaceStore from '@/features/search/model/form/interface-state';
import type * as QueryStore from '@/features/search/model/query-state';
import type * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import type * as ViewStore from '@/features/search/model/results/view-state';
import type * as BLTypes from '@/types/blacklabtypes';

const MAX_URL_LENGTH = 4000;

type UrlStateSlice = {
	query: QueryStore.ModuleRootState;
	interface: InterfaceStore.ModuleRootState;
	global: GlobalResultsStore.ModuleRootState;
	views: ViewStore.ModuleRootState;
};

export type ArticleUrlState = {
	docId: string | null;
	viewField: string | null;
	wordstart: number | null;
	wordend: number | null;
	findhit: number | null;
	pattern?: string | null;
	pattgapdata?: string | null;
	searchfield?: string | null;
};

export const emptyArticleUrlState: ArticleUrlState = {
	docId: null,
	viewField: null,
	wordstart: null,
	wordend: null,
	findhit: null,
};

export type UrlTransformInput = {
	contextUrl: string;
	indexId?: string | null;
	params?: BLTypes.BLSearchParameters;
	scopedFormQuery?: Record<string, string | string[]> | null;
	pattern?: string | null;
	gapValue?: string | null;
	searchfield?: string | null;
	article?: ArticleUrlState | null;
	state: UrlStateSlice;
};

export type UrlTransformOutput = {
	page: 'root' | 'search' | 'article';
	url: string;
	fullUrl: string;
	isTruncated: boolean;
};

function cleanParams<T extends Record<string, unknown>>(params: T): Partial<T> {
	return Object.entries(params).reduce((acc, [key, val]) => {
		if (val == null) {
			return acc;
		}
		if (typeof val === 'string' && val.length === 0) {
			return acc;
		}
		if (Array.isArray(val) && val.length === 0) {
			return acc;
		}
		(acc as any)[key] = val;
		return acc;
	}, {} as Partial<T>);
}

function getContextSegments(contextUrl: string): string[] {
	return new URI(contextUrl).segmentCoded().filter(s => !!s);
}

function toRelativeUrl(contextUrl: string, pathSegments: string[], queryParams: Record<string, unknown>): string {
	return new URI().segment(getContextSegments(contextUrl).concat(pathSegments)).host('').protocol('').port('').search(cleanParams(queryParams)).toString();
}

export function corpusSearchUrl(contextUrl: string, indexId: string): string {
	return toRelativeUrl(contextUrl, [indexId, 'search'], {});
}

export function searchStateToUrl(input: UrlTransformInput): UrlTransformOutput {
	if (!input.indexId || !input.params || !input.state.interface.viewedResults) {
		const url = input.indexId ? corpusSearchUrl(input.contextUrl, input.indexId) : input.contextUrl;
		return {
			page: 'root',
			url,
			fullUrl: url,
			isTruncated: false,
		};
	}

	const queryParams: Partial<BLTypes.BLSearchParameters> = cleanParams(input.params);
	const viewedResults = input.state.interface.viewedResults;
	const view = input.state.views[viewedResults];

	Object.assign(queryParams, {
		interface: JSON.stringify({
			form: input.state.query.form,
			exploreMode: input.state.query.form === 'explore' ? input.state.query.subForm : undefined,
			patternMode: input.state.query.form === 'search' ? input.state.query.subForm : undefined,
			viewedResults: undefined,
			activeAnnotationTab: input.state.interface.activeAnnotationTab || undefined,
			activeFilterTab: input.state.interface.activeFilterTab || undefined,
		} as Partial<InterfaceStore.ModuleRootState>),
		groupDisplayMode: view?.groupDisplayMode || undefined,
		resultViewCustomState: view?.customState || undefined,
		first: view?.first,
		number: view?.number,
	});
	Object.assign(queryParams, input.scopedFormQuery ?? {});

	const fullUrl = toRelativeUrl(input.contextUrl, [input.indexId, 'search', viewedResults], queryParams as Record<string, unknown>);
	const url =
		fullUrl.length <= MAX_URL_LENGTH
			? fullUrl
			: toRelativeUrl(input.contextUrl, [input.indexId, 'search', viewedResults], {
					...queryParams,
					patt: undefined,
					pattgapdata: undefined,
				});

	return {
		page: 'search',
		fullUrl,
		url,
		isTruncated: fullUrl !== url,
	};
}

export function articleUrlStateToUrl(input: UrlTransformInput): UrlTransformOutput | null {
	if (!input.indexId || !input.article?.docId) {
		return null;
	}

	const pattern = input.article.pattern ?? input.pattern ?? input.params?.patt ?? null;
	const gapValue = input.article.pattgapdata ?? input.gapValue ?? input.params?.pattgapdata ?? null;

	const queryParams = {
		query: pattern,
		pattgapdata: gapValue,
		searchfield: input.article.searchfield || input.searchfield || undefined,
		field: input.article.viewField || undefined,
		wordstart: input.article.wordstart,
		wordend: input.article.wordend,
		findhit: input.article.findhit,
	};

	const fullUrl = toRelativeUrl(input.contextUrl, [input.indexId, 'docs', input.article.docId], queryParams);
	if (fullUrl.length <= MAX_URL_LENGTH) {
		return {
			page: 'article',
			url: fullUrl,
			fullUrl,
			isTruncated: false,
		};
	}

	return {
		page: 'article',
		fullUrl,
		url: toRelativeUrl(input.contextUrl, [input.indexId, 'docs', input.article.docId], {
			...queryParams,
			query: undefined,
			pattgapdata: undefined,
		}),
		isTruncated: true,
	};
}

export function stateToUrl(input: UrlTransformInput): UrlTransformOutput {
	return articleUrlStateToUrl(input) || searchStateToUrl(input);
}
