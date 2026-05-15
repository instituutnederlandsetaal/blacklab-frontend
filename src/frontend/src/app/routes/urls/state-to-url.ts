// import URI from 'urijs';

// import { cleanQueryParams } from '@/shared/api/lib/api-utils';
// import type * as ArticleStore from '@/features/article/model/article-state';
// import type * as InterfaceStore from '@/features/search/model/form/interface-state';
// import type * as QueryStore from '@/features/search/model/query-state';
// import type * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
// import type * as ViewStore from '@/features/search/model/results/view-state';
// import type * as BLTypes from '@/types/blacklabtypes';

// const MAX_URL_LENGTH = 4000;

// type UrlStateSlice = {
// 	query: QueryStore.ModuleRootState;
// 	interface: InterfaceStore.ModuleRootState;
// 	global: GlobalResultsStore.ModuleRootState;
// 	views: ViewStore.ModuleRootState;
// 	article: ArticleStore.ModuleRootState;
// };

// export type UrlTransformInput = {
// 	contextUrl: string;
// 	indexId?: string|null;
// 	params?: BLTypes.BLSearchParameters;
// 	pattern?: string|null;
// 	gapValue?: string|null;
// 	searchField?: string|null;
// 	state: UrlStateSlice;
// };

// export type UrlTransformOutput = {
// 	page: 'root'|'search'|'article';
// 	url: string;
// 	fullUrl: string;
// 	isTruncated: boolean;
// };

// function getContextSegments(contextUrl: string): string[] {
// 	return new URI(contextUrl).segmentCoded().filter(s => !!s);
// }

// function toRelativeUrl(contextUrl: string, pathSegments: string[], queryParams: Record<string, unknown>): string {
// 	return new URI()
// 		.segment(getContextSegments(contextUrl).concat(pathSegments))
// 		.host('').protocol('').port('')
// 		.search(cleanQueryParams(queryParams))
// 		.toString();
// }

// export function corpusSearchUrl(contextUrl: string, indexId: string): string {
// 	return toRelativeUrl(contextUrl, [indexId, 'search'], {});
// }

// export function searchStateToUrl(input: {
// 	indexId: string;
// 	viewedResults: string|null;
// }&BLTypes.BLSearchParameters&{

// }): UrlTransformOutput {
// 	if (!input.indexId || !input.params || !input.state.interface.viewedResults) {
// 		const url = input.indexId ? corpusSearchUrl(input.contextUrl, input.indexId) : input.contextUrl;
// 		return {
// 			page: 'root',
// 			url,
// 			fullUrl: url,
// 			isTruncated: false,
// 		};
// 	}

// 	const queryParams: Partial<BLTypes.BLSearchParameters> = cleanParams(input.params);
// 	const viewedResults = input.state.interface.viewedResults;
// 	const view = input.state.views[viewedResults];

// 	Object.assign(queryParams, {
// 		interface: JSON.stringify({
// 			form: input.state.query.form,
// 			exploreMode: input.state.query.form === 'explore' ? input.state.query.subForm : undefined,
// 			patternMode: input.state.query.form === 'search' ? input.state.query.subForm : undefined,
// 			viewedResults: undefined,
// 			activeAnnotationTab: input.state.interface.activeAnnotationTab || undefined,
// 			activeFilterTab: input.state.interface.activeFilterTab || undefined,
// 		} as Partial<InterfaceStore.ModuleRootState>),
// 		groupDisplayMode: view?.groupDisplayMode || undefined,
// 		resultViewCustomState: view?.customState || undefined,
// 		first: view?.first,
// 		number: view?.number,
// 	});

// 	const fullUrl = toRelativeUrl(input.contextUrl, [input.indexId, 'search', viewedResults], queryParams as Record<string, unknown>);
// 	const url = fullUrl.length <= MAX_URL_LENGTH ? fullUrl : toRelativeUrl(input.contextUrl, [input.indexId, 'search', viewedResults], {
// 		...queryParams,
// 		patt: undefined,
// 		pattgapdata: undefined,
// 	});

// 	return {
// 		page: 'search',
// 		fullUrl,
// 		url,
// 		isTruncated: fullUrl !== url,
// 	};
// }

// export function articleStateToUrl(input: UrlTransformInput): UrlTransformOutput|null {
// 	if (!input.indexId || !input.state.article.docId) {
// 		return null;
// 	}

// 	const pattern = input.pattern ?? input.params?.patt ?? null;
// 	const gapValue = input.gapValue ?? input.params?.pattgapdata ?? null;

// 	const queryParams = {
// 		query: pattern,
// 		pattgapdata: gapValue,
// 		searchField: input.searchField || undefined,
// 		field: input.state.article.viewField || undefined,
// 		wordstart: input.state.article.wordstart,
// 		wordend: input.state.article.wordend,
// 		findhit: input.state.article.findhit,
// 	};

// 	const fullUrl = toRelativeUrl(input.contextUrl, [input.indexId, 'docs', input.state.article.docId], queryParams);
// 	if (fullUrl.length <= MAX_URL_LENGTH) {
// 		return {
// 			page: 'article',
// 			url: fullUrl,
// 			fullUrl,
// 			isTruncated: false,
// 		};
// 	}

// 	return {
// 		page: 'article',
// 		fullUrl,
// 		url: toRelativeUrl(input.contextUrl, [input.indexId, 'docs', input.state.article.docId], {
// 			...queryParams,
// 			query: undefined,
// 			pattgapdata: undefined,
// 		}),
// 		isTruncated: true,
// 	};
// }

// export function stateToUrl(input: UrlTransformInput): UrlTransformOutput {
// 	return articleStateToUrl(input) || searchStateToUrl(input);
// }
