import type { AxiosRequestConfig, Canceler } from 'axios';
import axios from 'axios';
import { stripIndent } from 'common-tags';
import type { User } from 'oidc-client-ts';

import { createEndpoint } from '@/api/apiutils';
import type { CFPageConfig, NormalizedFormat, NormalizedIndex, NormalizedIndexBase, Tagset } from '@/types/apptypes';
import { ApiError } from '@/types/apptypes';
import type * as BLTypes from '@/types/blacklabtypes';
import { isHitParams } from '@/utils';
import { normalizeFormat, normalizeIndex, normalizeIndexBase } from '@/utils/blacklabutils';

import { CancelableRequest } from '@/shared/api/lib/api-types';

/** How many values to return per attribute when requesting /relations */
const RELATIONS_LIMITVALUES = 1000;

type API = ReturnType<typeof createEndpoint>;

const endpoints = {
	// Communicates with the BlackLab Server instance
	blacklab: null as any as API,

	// Communicates with the frontend's own Java backend (which in turn can communicate with BLS)
	frontend: null as any as API,
};

/** Initialize an endpoint. In a function because urls might be set asynchronously (such as from customjs). */
export function init(which: keyof typeof endpoints, url: string, user: User | null) {
	if (!(which in endpoints)) throw new Error(`Unknown endpoint ${which}`);
	if (endpoints[which]) throw new Error(`Endpoint ${which} already initialized`);
	const headers = {};
	if (user) {
		// Authorization header must be re-created on each request, as the token might have changed
		// So wrap in a getter
		Object.defineProperty(headers, 'Authorization', {
			get() {
				return `Bearer ${user.access_token}`;
			},
			enumerable: true,
		});
	}

	endpoints[which] = createEndpoint({
		baseURL: url.replace(/\/*$/, '/'),
		paramsSerializer: params => new URLSearchParams(params).toString(),
		headers,
		params:
			which === 'blacklab'
				? {
						api: '4', // backward compat
					}
				: undefined,
	});
}

export const frontendPaths = {
	root: () => CONTEXT_URL,
	currentCorpus: (indexId: string) => `${CONTEXT_URL}/${indexId}/search`,
	/** Get the URL for displaying the document/article in the Frontend, with various highlighting and pagination params. */
	documentPage: (p: {
		indexId: string;
		pid: string;
		/** CQL Query to use to highlight hits */
		patt?: string;
		/** Pattgapdata to go with query */
		pattgapdata?: string;
		/** HACK: make the backend figure out which page to display based on the start index of the hit -- see ArticlePagination.vue/PaginationInfo.java */
		findhit?: number;
		/** Field on which the cql query is run. if searchfield differs from field (parallel corpus) */
		searchField?: string;
		/** Field for which to show the document contents (important when this is a parallel corpus, as there are multiple "copies" of the same document then, e.g. an English and Dutch version) */
		fieldName?: string;
	}) => {
		const url = new URL(`${CONTEXT_URL}/${p.indexId}/docs/${p.pid}`, window.location.origin);

		if (p.patt) url.searchParams.append('query', p.patt); // TODO support patt, like the regular search page.
		if (p.pattgapdata) url.searchParams.append('pattgapdata', p.pattgapdata);
		if (p.findhit !== undefined) url.searchParams.append('findhit', p.findhit.toString());
		if (p.searchField) url.searchParams.append('searchfield', p.searchField);
		if (p.fieldName) url.searchParams.append('field', p.fieldName);
		return url.toString();
	},

	// The following paths are only for use with the api endpoint (they don't contain the context url - the endpoint will add it)
	indexInfo: (indexId: string) => `${indexId}/api/info`,
	config: (indexId: string | null) => (indexId ? `${indexId}/api/config` : `api/config`),
	tagset: (indexId: string) => `${indexId}/static/tagset.json`,
	documentContents: (indexId: string, pid: string) => `${indexId}/api/docs/${pid}/contents`,
	documentMetadata: (indexId: string, pid: string) => `${indexId}/api/docs/${pid}`,

	help: (indexId?: string) => `${indexId ? indexId + '/' : ''}api/help`,
	about: (indexId?: string) => `${indexId ? indexId + '/' : ''}api/about`,
};

/** Contains url mappings for different requests to blacklab-server */
export const blacklabPaths = {
	/*
		Stupid issue, sending a request to /blacklab-server redirects to /blacklab-server/
		Problem is, the redirect response is missing the CORS header
		so the browser doesn't allow the redirect.
		There doesn't seem to be a way to fix this in the server as the redirect
		is performed by the servlet container and runs before any application code.
		So ensure our requests end with a trailing slash to prevent the server from redirecting
	*/
	root: () => './',
	index: (indexId: string) => `${indexId}/`,
	indexStatus: (indexId: string) => `${indexId}/status/`,
	field: (indexId: string, fieldName: string) => `${indexId}/fields/${fieldName}/`,

	/** Retrieve the relations/inline tags in the corpus. Since 4.0 */
	relations: (indexId: string) => `${indexId}/relations/`,
	documentUpload: (indexId: string) => `${indexId}/docs/`,
	shares: (indexId: string) => `${indexId}/sharing/`,
	formats: () => `input-formats/`,
	formatContent: (id: string) => `input-formats/${id}/`,
	formatXslt: (id: string) => `input-formats/${id}/xslt`,

	docInfo: (indexId: string, docId: string) => `${indexId}/docs/${docId}`,
	hits: (indexId: string) => `${indexId}/hits/`,
	hitsCsv: (indexId: string) => `${indexId}/hits-csv/`,
	docs: (indexId: string) => `${indexId}/docs/`,
	docsCsv: (indexId: string) => `${indexId}/docs-csv/`,
	snippet: (indexId: string, docId: string) => `${indexId}/docs/${docId}/snippet/`,
	parsePattern: (indexId: string) => `${indexId}/parse-pattern/`,

	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteAnnotation: (indexId: string, annotatedFieldId: string, annotationId: string) => `${endpoints.blacklab.defaults.baseURL}${indexId}/autocomplete/${annotatedFieldId}/${annotationId}/`,
	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteMetadata: (indexId: string, metadataFieldId: string) => `${endpoints.blacklab.defaults.baseURL}${indexId}/autocomplete/${metadataFieldId}/`,
	termFrequencies: (indexId: string) => `${indexId}/termfreq/`,
};

export type ApiEndpoint<ResponseType = never, Params extends any[] = []> = (...args: [...Params, requestParameters?: AxiosRequestConfig]) => CancelableRequest<ResponseType>;

export type ParsePatternResponse = {
	parsed: {
		bcql: string;
		json: any;
	};
};

export type DocumentContentsParameters = {
	indexId: string;
	docId: string;
	patt?: string;
	pattgapdata?: string;
	wordstart?: number;
	wordend?: number;
	/** Annotated field for which to get contents */
	viewField: string;
	/** Annotated field in which to search (for parallel corpora) - only required if different from field */
	searchfield?: string;
};

export interface BlackLabApi {
	getServerInfo: ApiEndpoint<BLTypes.BLServer>;
	getUser: ApiEndpoint<BLTypes.BLUser>;
	getCorpora: ApiEndpoint<NormalizedIndexBase[]>;
	getCorpusStatus: ApiEndpoint<NormalizedIndexBase, [id: string]>;
	getCorpus: ApiEndpoint<NormalizedIndex, [id: string]>;
	getAnnotatedField: ApiEndpoint<BLTypes.BLAnnotatedField, [indexId: string, fieldName: string]>;
	getShares: ApiEndpoint<BLTypes.BLShareInfo, [id: string]>;
	getFormats: ApiEndpoint<NormalizedFormat[]>;
	getFormatContent: ApiEndpoint<BLTypes.BLFormatContent, [id: string]>;
	getFormatXslt: ApiEndpoint<string, [id: string]>;
	postShares: ApiEndpoint<BLTypes.BLResponse, [id: string, users: BLTypes.BLShareInfo]>;
	postFormat: ApiEndpoint<BLTypes.BLResponse, [name: string, contents: string]>;
	postCorpus: ApiEndpoint<BLTypes.BLResponse, [id: string, displayName: string, format: string]>;
	postDocuments: ApiEndpoint<BLTypes.BLResponse, [indexId: string, docs: File[], meta?: File[] | null, onProgress?: (percentage: number) => any]>;
	deleteFormat: ApiEndpoint<BLTypes.BLResponse, [id: string]>;
	deleteCorpus: ApiEndpoint<BLTypes.BLResponse, [id: string]>;
	getDocumentInfo: ApiEndpoint<BLTypes.BLDocument, [indexId: string, documentId: string, params?: { query?: string }]>;
	getRelations: ApiEndpoint<BLTypes.BLRelationInfo, [indexId: string]>;
	getParsePattern: ApiEndpoint<ParsePatternResponse, [indexId: string, pattern: string]>;
	getHits<T extends BLTypes.BLHitResults | BLTypes.BLHitGroupResults = BLTypes.BLHitResults | BLTypes.BLHitGroupResults>(
		indexId: string,
		params: BLTypes.BLSearchParameters,
		requestParameters?: AxiosRequestConfig,
	): CancelableRequest<T>;
	getHitsCsv: ApiEndpoint<Blob, [indexId: string, params: BLTypes.BLSearchParameters]>;
	getDocsCsv: ApiEndpoint<Blob, [indexId: string, params: BLTypes.BLSearchParameters]>;
	getDocs<T extends BLTypes.BLDocResults | BLTypes.BLDocGroupResults = BLTypes.BLDocResults | BLTypes.BLDocGroupResults>(
		indexId: string,
		params: BLTypes.BLSearchParameters,
		requestParameters?: AxiosRequestConfig,
	): CancelableRequest<T>;
	getSnippet: ApiEndpoint<BLTypes.BLHit, [indexId: string, docId: string, field: string | undefined, hitstart: number, hitend: number, context?: string | number]>;
	getTermFrequencies: ApiEndpoint<BLTypes.BLTermOccurances, [indexId: string, annotationId: string, values?: string[], filter?: string, number?: number]>;
	getTermAutocomplete: ApiEndpoint<string[], [indexId: string, annotatedFieldId: string, annotationId: string, prefix: string]>;
}

export interface FrontendApi {
	getCorpus: ApiEndpoint<BLTypes.BLIndexMetadata, [indexId: string]>;
	/** Retrieve the config for a given corpus/index, or return the default config (or overrides of the default config) if indexId is null */
	getConfig: ApiEndpoint<CFPageConfig, [indexId: string | null]>;
	getDocumentContents: ApiEndpoint<string, [params: DocumentContentsParameters]>;
	getDocumentMetadata: ApiEndpoint<string, [indexId: string, pid: string]>;
	/** Return the HTML of the help page for the corpus, or the default help page if indexId is not provided */
	getHelp: ApiEndpoint<string, [indexId?: string]>;
	/** Return the HTML of the about page for the corpus, or the default about page if indexId is not provided */
	getAbout: ApiEndpoint<string, [indexId?: string]>;
	getTagset: ApiEndpoint<Tagset, [indexId: string]>;
}

export interface ApiModule {
	blacklab: BlackLabApi;
	frontend: FrontendApi;
}

function rejectedRequest<T>(error: ApiError): CancelableRequest<T> {
	return new CancelableRequest(Promise.reject(error), () => {});
}

function combineRequests<T>(requests: Array<CancelableRequest<unknown>>, request: Promise<T>): CancelableRequest<T> {
	return new CancelableRequest(request, () => requests.forEach(request => request.cancel()));
}

/**
 * Blacklab api
 */
export const blacklab: BlackLabApi = {
	getServerInfo: (requestParameters?: AxiosRequestConfig) => endpoints.blacklab.getCancelable<BLTypes.BLServer>(blacklabPaths.root(), undefined, requestParameters),

	getUser: (requestParameters?: AxiosRequestConfig) => endpoints.blacklab.getCancelable<BLTypes.BLServer>(blacklabPaths.root(), undefined, requestParameters).then(r => r.user),

	getCorpora: (requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab
			.getCancelable<BLTypes.BLServer>(blacklabPaths.root(), undefined, requestParameters)
			.then(r => Object.entries({ ...r.corpora, ...r.indices }).map(([id, c]) => normalizeIndexBase(c, id))),

	getCorpusStatus: (id: string, requestParamers?: AxiosRequestConfig) =>
		endpoints.blacklab.getCancelable<BLTypes.BLIndex>(blacklabPaths.indexStatus(id), undefined, requestParamers).then(r => normalizeIndexBase(r, id)),

	getCorpus: (id: string, requestParameters?: AxiosRequestConfig) => {
		const indexRequest = frontend.getCorpus(id, requestParameters);
		const relationsRequest = blacklab.getRelations(id, requestParameters);
		return combineRequests(
			[indexRequest, relationsRequest],
			Promise.all([indexRequest.request, relationsRequest.request]).then(([index, relations]) => normalizeIndex(index, relations)),
		);
	},

	getAnnotatedField: (indexId: string, fieldName: string, requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab.getCancelable<BLTypes.BLAnnotatedField>(blacklabPaths.field(indexId, fieldName), undefined, requestParameters),

	getShares: (id: string, requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab.getCancelable<{ 'users[]': BLTypes.BLShareInfo }>(blacklabPaths.shares(id), undefined, requestParameters).then(r => r['users[]']),

	getFormats: (requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab
			.getCancelable<BLTypes.BLFormats>(blacklabPaths.formats(), undefined, requestParameters)
			.then(r => Object.entries(r.supportedInputFormats))
			.then(r => r.map(([id, format]) => normalizeFormat(id, format))),

	getFormatContent: (id: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab.getCancelable<BLTypes.BLFormatContent>(blacklabPaths.formatContent(id), undefined, requestParameters),

	getFormatXslt: (id: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab.getCancelable<string>(blacklabPaths.formatXslt(id), undefined, requestParameters),

	postShares: (id: string, users: BLTypes.BLShareInfo, requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab.postCancelable<BLTypes.BLResponse>(
			blacklabPaths.shares(id),
			users.reduce((params, user) => {
				const trimmed = user.trim();
				if (trimmed) params.append('users[]', trimmed);
				return params;
			}, new URLSearchParams()),
			{
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
				},
			},
		),

	postFormat: (name: string, contents: string, requestParameters?: AxiosRequestConfig) => {
		const data = new FormData();
		data.append('data', new File([contents], name, { type: 'text/plain' }), name);
		return endpoints.blacklab.postCancelable<BLTypes.BLResponse>(blacklabPaths.formats(), data, requestParameters);
	},

	postCorpus: (id: string, displayName: string, format: string, requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab.postCancelable<BLTypes.BLResponse>(blacklabPaths.root(), new URLSearchParams({ name: id, display: displayName, format }), {
			...requestParameters,
			headers: {
				...(requestParameters || {}).headers,
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			},
		}),

	postDocuments: (indexId: string, docs: File[], meta?: File[] | null, onProgress?: (percentage: number) => any, requestParameters?: AxiosRequestConfig) => {
		const formData = new FormData();
		for (let i = 0; i < (docs ? docs.length : 0); ++i) {
			formData.append('data', docs[i], docs[i].name);
		}
		for (let i = 0; i < (meta ? meta.length : 0); ++i) {
			formData.append('linkeddata', meta![i], meta![i].name);
		}

		return endpoints.blacklab.postCancelable<BLTypes.BLResponse>(blacklabPaths.documentUpload(indexId), formData, {
			...requestParameters,
			headers: {
				...(requestParameters || {}).headers,
				'Content-Type': 'multipart/form-data',
			},
			onUploadProgress: (event: ProgressEvent) => {
				if (onProgress) {
					onProgress((event.loaded / event.total) * 100);
				}
			},
		});
	},

	deleteFormat: (id: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab.deleteCancelable<BLTypes.BLResponse>(blacklabPaths.formatContent(id), requestParameters),

	deleteCorpus: (id: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab.deleteCancelable<BLTypes.BLResponse>(blacklabPaths.index(id), requestParameters),

	getDocumentInfo: (indexId: string, documentId: string, params: { query?: string } = {}, requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab.getOrPostCancelable<BLTypes.BLDocument>(blacklabPaths.docInfo(indexId, documentId), params, requestParameters),

	getRelations: (indexId: string, requestParameters?: AxiosRequestConfig) =>
		endpoints.blacklab.getCancelable<BLTypes.BLRelationInfo>(blacklabPaths.relations(indexId), { limitvalues: RELATIONS_LIMITVALUES }, requestParameters),

	getParsePattern: (indexId: string, pattern: string, requestParameters?: AxiosRequestConfig) => {
		if (!indexId) {
			return rejectedRequest(new ApiError('Error', 'No index specified.', 'Internal error', undefined));
		} else if (!pattern) {
			return rejectedRequest(new ApiError('Info', 'Cannot parse without pattern.', 'No results', undefined));
		} else {
			return endpoints.blacklab.getOrPostCancelable<ParsePatternResponse>(blacklabPaths.parsePattern(indexId), { patt: pattern }, { ...requestParameters });
		}
	},

	getHits: <T extends BLTypes.BLHitResults | BLTypes.BLHitGroupResults = BLTypes.BLHitResults | BLTypes.BLHitGroupResults>(
		indexId: string,
		params: BLTypes.BLSearchParameters,
		requestParameters?: AxiosRequestConfig,
	) => {
		if (!isHitParams(params)) {
			return new CancelableRequest(Promise.reject(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined)), () => {});
		} else {
			return endpoints.blacklab.getOrPostCancelable<T>(blacklabPaths.hits(indexId), params, requestParameters);
		}
	},

	getHitsCsv: (indexId: string, params: BLTypes.BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
		const csvParams = Object.assign({}, params, {
			number: undefined,
			first: undefined,
			outputformat: 'csv',
		});

		if (!isHitParams(params)) {
			return new CancelableRequest(Promise.reject(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined)), () => {});
		} else {
			return endpoints.blacklab.getOrPostCancelable<Blob>(blacklabPaths.hitsCsv(indexId), csvParams, {
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					Accept: 'text/csv',
				},
				responseType: 'blob',
				transformResponse: (data: any) => new Blob([data], { type: 'text/plain;charset=utf-8' }),
			});
		}
	},

	getDocsCsv(indexId: string, params: BLTypes.BLSearchParameters, requestParameters?: AxiosRequestConfig) {
		const csvParams = Object.assign({}, params, {
			number: undefined,
			first: undefined,
			outputformat: 'csv',
		});

		return endpoints.blacklab.getOrPostCancelable<Blob>(blacklabPaths.docsCsv(indexId), csvParams, {
			...requestParameters,
			headers: {
				...(requestParameters || {}).headers,
				Accept: 'text/csv',
			},
			responseType: 'blob',
			transformResponse: (data: any) => new Blob([data], { type: 'text/plain;charset=utf-8' }),
		});
	},

	getDocs: <T extends BLTypes.BLDocResults | BLTypes.BLDocGroupResults = BLTypes.BLDocResults | BLTypes.BLDocGroupResults>(
		indexId: string,
		params: BLTypes.BLSearchParameters,
		requestParameters?: AxiosRequestConfig,
	): CancelableRequest<T> => {
		return endpoints.blacklab.getOrPostCancelable<T>(blacklabPaths.docs(indexId), params, requestParameters);
	},

	/**
	 *
	 * @param indexId the index
	 * @param docId the document
	 * @param field the annotatedField to get the snippet from (for parallel documents/corpora which have multiple versions of the same document). If undefined, BlackLab will return the default field.
	 * @param hitstart
	 * @param hitend
	 * @param context either a number (n words before and after, or a "span" type relation (ui.search.shared.within.elements in the store))
	 * @param requestParameters
	 * @returns
	 */
	getSnippet: (indexId: string, docId: string, field: string | undefined, hitstart: number, hitend: number, context?: string | number, requestParameters?: AxiosRequestConfig) => {
		return endpoints.blacklab
			.getOrPostCancelable<BLTypes.BLHit>(
				blacklabPaths.snippet(indexId, docId),
				{
					hitstart,
					hitend,
					context,
					field,
				},
				requestParameters,
			)
			.then(r => {
				// BlackLab doesn't always return the left/right/before/after context fields (at document boundaries)
				// Fill them in with blanks to simplify rendering code.
				if (!r.left)
					r.left = Object.entries(r.match).reduce((acc, [key, value]) => {
						acc[key] = [];
						return acc;
					}, {} as BLTypes.BLHitSnippetPart);
				if (!r.right)
					r.right = Object.entries(r.match).reduce((acc, [key, value]) => {
						acc[key] = [];
						return acc;
					}, {} as BLTypes.BLHitSnippetPart);
				return r;
			});
	},

	getTermFrequencies: (indexId: string, annotationId: string, values?: string[], filter?: string, number = 20, requestParameters?: AxiosRequestConfig) => {
		return endpoints.blacklab.getOrPostCancelable<BLTypes.BLTermOccurances>(
			blacklabPaths.termFrequencies(indexId),
			{
				annotation: annotationId,
				filter,
				terms: values && values.length ? values.join(',') : undefined,
				number,
			},
			requestParameters,
		);
	},

	getTermAutocomplete: (indexId: string, annotatedFieldId: string, annotationId: string, prefix: string, requestParameters?: AxiosRequestConfig) => {
		return endpoints.blacklab.getOrPostCancelable<string[]>(
			blacklabPaths.autocompleteAnnotation(indexId, annotatedFieldId, annotationId),
			{
				term: prefix,
			},
			requestParameters,
		);
	},
};

/**
 * API for blacklab-frontend's own webservice
 */
const frontendApi: FrontendApi = {
	getCorpus: (indexId: string, requestParameters?: AxiosRequestConfig) =>
		endpoints.frontend.getCancelable<BLTypes.BLIndexMetadata>(frontendPaths.indexInfo(indexId), undefined, requestParameters).catch<never>(e => {
			if (!(e instanceof ApiError)) {
				// Should never happen - API always returns ApiError, but just in case...
				throw new ApiError(e?.name ?? 'Unknown error', e?.message ?? 'An unknown error occurred.', 'Unknown error', undefined);
			} else if (e.httpCode === 401) {
				throw new ApiError('Not allowed', 'You need to be logged in to access this corpus.', 'Not allowed', 401);
			} else if (e.httpCode === 403) {
				throw new ApiError('Not allowed', 'You do not have permission to access this corpus.', 'Not allowed', 403);
			} else if (e.httpCode === 404) {
				// Not found. May not be configured correctly.
				console.error(`ApiError: ${JSON.stringify(e)}`);
				if (e.title === 'CANNOT_OPEN_INDEX' || e.message.indexOf('CANNOT_OPEN_INDEX') !== -1) {
					// TODO i18n
					throw new ApiError(
						'Corpus not found',
						stripIndent`
						Corpus '${indexId}' not found.<br>
						Please check the spelling, or go to <a href="${CONTEXT_URL}">${CONTEXT_URL}</a> to get a list of available corpora.<br>
						If it's not there, refer to the documentation at <a href="https://blacklab.ivdnt.org" target="_blank">https://blacklab.ivdnt.org</a> and check your configuration.`,
						e.statusText,
						e.httpCode,
					);
				} else {
					// No blacklab response; something isn't configured correctly.
					throw new ApiError(
						'Corpus not found',
						stripIndent`
						Unable to contact BlackLab Server (or blacklab-frontend's own server component).<br> 
						Make sure both .war applications have been deployed, and your properties file<br>
						is in the correct location and has the correct name.<br>
						Refer to the documentation at <a href="https://blacklab.ivdnt.org" target="_blank">https://blacklab.ivdnt.org</a>`,
						e.statusText,
						e.httpCode,
					);
				}
			} else if (e.message.indexOf('blacklabResponse') !== -1) {
				// Some other blacklab error.
				throw new ApiError('BlackLab error', e.message, e.statusText, e.httpCode);
			} else {
				// Some other API error. Show message.
				throw e;
			}
		}),
	getConfig: (indexId: string | null, requestParameters?: AxiosRequestConfig) => endpoints.frontend.getCancelable<CFPageConfig>(frontendPaths.config(indexId), undefined, requestParameters),

	/** Get transformed document contents */
	getDocumentContents: (params: DocumentContentsParameters, requestParameters?: AxiosRequestConfig) =>
		endpoints.frontend.getCancelable<string>(frontendPaths.documentContents(params.indexId, params.docId), params, requestParameters),

	/** Get transformed document metadata */
	getDocumentMetadata: (indexId: string, pid: string, requestParameters?: AxiosRequestConfig) =>
		endpoints.frontend.getCancelable<string>(frontendPaths.documentMetadata(indexId, pid), undefined, requestParameters),

	/** Get html content of the help page. */
	getHelp: (indexId?: string, requestParameters?: AxiosRequestConfig) => endpoints.frontend.getCancelable<string>(frontendPaths.help(indexId), undefined, requestParameters),
	/** Get html content of the about page. */
	getAbout: (indexId?: string, requestParameters?: AxiosRequestConfig) => endpoints.frontend.getCancelable<string>(frontendPaths.about(indexId), undefined, requestParameters),
	getTagset: (indexId: string, requestParameters?: AxiosRequestConfig) =>
		endpoints.frontend.getCancelable<Tagset>(frontendPaths.tagset(indexId), undefined, {
			...requestParameters,
			// Remove comment-lines in the returned json. (that's not strictly allowed by JSON, but we chose to support it)
			transformResponse: [(r: string) => r.replace(/\/\/.*[\r\n]+/g, '')].concat(axios.defaults.transformResponse!),
		}),
};

export const frontend: FrontendApi = frontendApi;

export { ApiError };
export type { Canceler };
