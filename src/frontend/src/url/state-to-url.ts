// import * as RootStore from '@/store';
// import * as CorpusStore from '@/store/corpus';
// import * as ArticleStore from '@/store/article';
// import * as QueryStore from '@/store/query';
// import * as InterfaceStore from '@/store/form/interface';
// import UrlStateParserBase from '@/url/url-state-parser-base';
// import UrlStateParserSearch from '@/url/url-state-parser-search';
// import { HistoryEntry } from '@/store/history';
// import { BLSearchParameters } from '@/types/blacklabtypes';

// function cleanParams<T extends {}>(params: T): T {
// 	return Object.entries(params).reduce((acc, [key, val]) => {
// 		if (val == null) { return acc; }
// 		if (typeof val === 'string' && val.length === 0) { return acc; }
// 		if (Array.isArray(val) && val.length === 0) { return acc; }
// 		if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val).length === 0) { return acc; }
// 		acc[key] = val;
// 		return acc;
// 	}, {} as any);
// }

// function valuesToString<T extends {}>(t: T): {[K in keyof T]: string} {
// 	// @ts-ignore
// 	return t;
// }

// type PageUrl<
// 	PathParameters extends Record<string, string>,
// 	QueryParameters extends Record<string, string|number|boolean>
// > = {
// 	path: PathParameters;
// 	query: { [K in keyof QueryParameters]-?: QueryParameters[K]|null|undefined };
// }

// type UrlGetters<T extends Record<string, string|number|boolean>> = {
// 	[K in keyof T]: () => T[K]|undefined|null;
// }

// type ArticlePageUrl = PageUrl<{
// 	corpusId: string;
// 	docId: string;
// }, {
// 	query: string;
// 	pattgapdata: string;
// 	viewField: string;
// 	searchField: string;

// 	wordstart: number;
// 	wordend: number;
// 	findhit: number;
// }>

// type UrlGeneratorAndDecoder<
// 	T extends PageUrl<any, any>,
// 	DecodedState extends {} = T
// > = {
// 	isActive(state: T): boolean;
// 	decode(url: string): Promise<DecodedState>;

// 	// Egh, typescript gymnastics
// 	gatherPath: T extends PageUrl<infer P, any> ? UrlGetters<P> : never;
// 	gatherQuery: T extends PageUrl<any, infer Q> ? UrlGetters<Q> : never;
// 	encode(state: T): string;
// }

// function asUrlStateParser<T extends PageUrl<any, any>>(
// 	parse: (this: UrlStateParserBase<T>) => Promise<T>
// ): ((url: string) => Promise<T>) {
// 	class AnonymousInstance extends UrlStateParserBase<T> { get() { return parse.call(this); } }
// 	return (url: string) => new AnonymousInstance(new URI(url)).get();
// }

// const articlePage: UrlGeneratorAndDecoder<ArticlePageUrl> = {
// 	gatherPath: {
// 		corpusId: () => RootStore.getState().corpusId,
// 		docId: () => ArticleStore.getState().docId,
// 	},
// 	gatherQuery: {
// 		findhit: () => ArticleStore.getState().findhit,
// 		query: () => QueryStore.get.patternString(),
// 		pattgapdata: () => QueryStore.getState().gap?.value,
// 		searchField: () => QueryStore.get.annotatedFieldName(),
// 		viewField: () => ArticleStore.getState().viewField,
// 		wordstart: () => ArticleStore.getState().wordstart,
// 		wordend: () => ArticleStore.getState().wordend,
// 	},
// 	isActive(state): boolean {
// 		return !!state.path.corpusId && !!state.path?.docId;
// 	},
// 	encode(state: ArticlePageUrl): string {
// 		const {corpusId, docId} = state.path;
// 		return `/${encodeURIComponent(corpusId)}/docs/${encodeURIComponent(docId)}?${new URLSearchParams(valuesToString(cleanParams(state.query))).toString()}`;
// 	},
// 	decode: asUrlStateParser(async function() {
// 		const [corpusId, _, docId] = this.paths;
// 		const r: ArticlePageUrl = {
// 			path: { corpusId, docId, },
// 			query: {
// 				findhit: this.getNumber('findhit'),
// 				pattgapdata: this.getString('pattgapdata'),
// 				query: this.getString('query'),
// 				searchField: this.getString('searchField'),
// 				viewField: this.getString('viewField'),
// 				wordstart: this.getNumber('wordstart'),
// 				wordend: this.getNumber('wordend'),
// 			}
// 		}

// 		return r;
// 	})
// }

// type CorpusPageUrl = PageUrl<{
// 	corpusId: string;
// 	viewedResults: string;
// }, {
// 	// What is visible in the UI
// 	interface: string;
// 	groupDisplayMode: string;
// 	resultsViewCustomState: any;
// }&BLSearchParameters>

// import * as UIStore from '@/store/ui';
// import * as GlobalResultsStore from '@/store/results/global';
// import * as FilterStore from '@/store/form/filters';

// const corpusPage: UrlGeneratorAndDecoder<CorpusPageUrl, HistoryEntry> = {
// 	gatherPath: {
// 		corpusId: () => RootStore.getState().corpusId,
// 		viewedResults: () => InterfaceStore.get.viewedResults(),
// 	},
// 	gatherQuery: {
// 		adjusthits: () => 'yes',
// 		context: () => GlobalResultsStore.getState().context,
// 		interface: () => JSON.stringify({
// 			form: QueryStore.getState().form,
// 			exploreMode: QueryStore.getState().form === 'explore' ? QueryStore.getState().subForm : undefined, // remove if not relevant
// 			patternMode: QueryStore.getState().form === 'search' ? QueryStore.getState().subForm : undefined, // remove if not relevant
// 			viewedResults: undefined, // remove from query parameters: is encoded in path (viewedResults)
// 		}),
// 		groupDisplayMode: () => RootStore.get.viewedResultsSettings().groupDisplayMode,
// 		resultsViewCustomState: () => RootStore.get.viewedResultsSettings().customState ? JSON.stringify(RootStore.get.viewedResultsSettings().customState) : undefined,
// 		docpid: () => undefined,
// 		field: () => QueryStore.get.annotatedFieldName(),
// 		filter: () => QueryStore.get.filterString(),
// 		first: () => GlobalResultsStore.getState().pageSize * RootStore.get.viewedResultsSettings().page,
// 		group: () => RootStore.get.viewedResultsSettings().groupBy.join(','),
// 		includetokencount: () => undefined,
// 		listmetadatavalues: () => undefined,
// 		listvalues: () => undefined,
// 		maxcount: () => undefined,
// 		maxretrieve: () => undefined,
// 		number: () => GlobalResultsStore.getState().pageSize,
// 		patt: () => QueryStore.get.patternString(),
// 		pattgapdata: () => QueryStore.getState().gap?.value,
// 		sample: () => (GlobalResultsStore.getState().sampleMode === 'percentage' && GlobalResultsStore.getState().sampleSize) ? GlobalResultsStore.getState().sampleSize : undefined,
// 		sort: () => RootStore.get.viewedResultsSettings().sort,
// 		samplenum: () => (GlobalResultsStore.getState().sampleMode === 'count' && GlobalResultsStore.getState().sampleSize) ? GlobalResultsStore.getState().sampleSize : undefined,
// 		sampleseed: () => GlobalResultsStore.getState().sampleSize ? GlobalResultsStore.getState().sampleSeed : undefined,
// 		searchfield: () => undefined,
// 		viewgroup: () => RootStore.get.viewedResultsSettings().viewGroup,
// 		waitfortotal: () => undefined,
// 	},
// 	isActive(state): boolean {
// 		return state.path.corpusId != null;
// 	},
// 	encode(state) {
// 		const {corpusId, viewedResults} = state.path;
// 		return `/${corpusId}/search/${viewedResults}?${new URLSearchParams(valuesToString(cleanParams(state.query))).toString()}`;
// 	},
// 	decode: url => new UrlStateParserSearch(FilterStore.getState().filters, new URI(url)).get()
// }
