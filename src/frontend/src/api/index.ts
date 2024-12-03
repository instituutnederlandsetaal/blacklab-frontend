import axios, {Canceler, AxiosRequestConfig} from 'axios';
import * as qs from 'qs';

import {createEndpoint} from '@/api/apiutils';
import {normalizeIndex, normalizeFormat, normalizeIndexBase} from '@/utils/blacklabutils';

import * as BLTypes from '@/types/blacklabtypes';
import { ApiError, NormalizedIndex, NormalizedIndexBase } from '@/types/apptypes';
import { Glossing } from '@/store/search/form/glossStore';
import { AtomicQuery, LexiconEntry } from '@/store/search/form/conceptStore';
import { uniq } from '@/utils';
import { User } from 'oidc-client-ts';

type API = ReturnType<typeof createEndpoint>;

const endpoints = {

	// Communicates with the BlackLab Server instance
	blacklab: null as any as API,

	// Communicates with the frontend's own Java backend (which in turn can communicate with BLS)
	cf: null as any as API,

	//
	gloss: null as any as API,

	//
	concept: null as any as API,
};

/** Initialize an endpoint. In a function because urls might be set asynchronously (such as from customjs). */
export function init(which: keyof typeof endpoints, url: string, user: User|null) {
	if (!(which in endpoints)) throw new Error(`Unknown endpoint ${which}`);
	if (endpoints[which]) throw new Error(`Endpoint ${which} already initialized`);
	const headers = {};
	if (user) {
		// Authorization header must be re-created on each request, as the token might have changed
		// So wrap in a getter
		Object.defineProperty(headers, 'Authorization', {
			get() { return `Bearer ${user.access_token}`; },
			enumerable: true,
		});
	}

	endpoints[which] = createEndpoint({
		baseURL: url.replace(/\/*$/, '/'),
		paramsSerializer: params => qs.stringify(params),
		headers
	});
}

// We need this for transforming metadata fields in reponses from (optional) strings to (required) arrays
// i.e. polyfilling missing document info fields in responses.
// const allMetadataFields = CorpusStore.get.allMetadataFields().map(f => f.id);

export const frontendPaths = {
	currentCorpus: () => `${CONTEXT_URL}/${INDEX_ID}/search`,

	// The following paths are only for use with the api endpoint (they don't contain the context url - the endpoint will add it)
	indexInfo: () => `${INDEX_ID}/api/info`,
	documentContents: (pid: string) => `${INDEX_ID}/docs/${pid}/contents`,
	documentMetadata: (pid: string) => `${INDEX_ID}/docs/${pid}`,
}

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
	root: () =>                                     './',
	index: (indexId: string) =>                     `${indexId}/`,
	indexStatus: (indexId: string) =>               `${indexId}/status/`,
	field: (indexId: string, fieldName: string) =>  `${indexId}/fields/${fieldName}/`,

	/** Retrieve the relations/inline tags in the corpus. Since 4.0 */
	relations: (indexId: string) =>                 `${indexId}/relations/`,
	documentUpload: (indexId: string) =>            `${indexId}/docs/`,
	shares: (indexId: string) =>                    `${indexId}/sharing/`,
	formats: () =>                                  `input-formats/`,
	formatContent: (id: string) =>                  `input-formats/${id}/`,
	formatXslt: (id: string) =>                     `input-formats/${id}/xslt`,

	docInfo: (indexId: string, docId: string) =>    `${indexId}/docs/${docId}`,
	hits: (indexId: string) =>                      `${indexId}/hits/`,
	hitsCsv: (indexId: string) =>                   `${indexId}/hits-csv/`,
	docs: (indexId: string) =>                      `${indexId}/docs/`,
	docsCsv: (indexId: string) =>                   `${indexId}/docs-csv/`,
	snippet: (indexId: string, docId: string) =>    `${indexId}/docs/${docId}/snippet/`,
	parsePattern: (indexId: string) =>              `${indexId}/parse-pattern/`,

	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteAnnotation: (
		indexId: string,
		annotatedFieldId: string,
		annotationId: string) =>                    `${endpoints.blacklab.defaults.baseURL}${indexId}/autocomplete/${annotatedFieldId}/${annotationId}/`,
	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteMetadata: (
		indexId: string,
		metadataFieldId: string) =>                 `${endpoints.blacklab.defaults.baseURL}${indexId}/autocomplete/${metadataFieldId}/`,
	termFrequencies: (indexId: string) =>           `${indexId}/termfreq/`,
};

/**
 * Blacklab api
 */
export const blacklab = {
	getServerInfo: (requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLServer>(blacklabPaths.root(), undefined, requestParameters),

	getUser: (requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLServer>(blacklabPaths.root(), undefined, requestParameters)
		.then(r => r.user),

	getCorpora: (requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLServer>(blacklabPaths.root(), undefined, requestParameters)
		.then(r => Object.entries({...r.corpora, ...r.indices}).map(([id, c]) => normalizeIndexBase(c, id))),

	getCorpusStatus: (id: string, requestParamers?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLIndex>(blacklabPaths.indexStatus(id), undefined, requestParamers)
		.then(r => normalizeIndexBase(r, id)),

	getCorpus: (id: string, requestParameters?: AxiosRequestConfig) => Promise.all([
		endpoints.blacklab.get<BLTypes.BLIndexMetadata>(blacklabPaths.index(id), undefined, requestParameters),
		endpoints.blacklab.get<BLTypes.BLRelationInfo>(blacklabPaths.relations(id), undefined, requestParameters)
	]).then(([index, relations]) => normalizeIndex(index, relations)),

	getAnnotatedField: (corpusId: string, fieldName: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLAnnotatedField>(blacklabPaths.field(corpusId, fieldName), undefined, requestParameters),

	getShares: (id: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<{'users[]': BLTypes.BLShareInfo}>(blacklabPaths.shares(id), undefined, requestParameters)
		.then(r => r['users[]']),

	getFormats: (requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLFormats>(blacklabPaths.formats(), undefined, requestParameters)
		.then(r => Object.entries(r.supportedInputFormats))
		.then(r => r.map(([id, format]) => normalizeFormat(id, format))),

	getFormatContent: (id: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLFormatContent>(blacklabPaths.formatContent(id), undefined, requestParameters),

	getFormatXslt: (id: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<string>(blacklabPaths.formatXslt(id), undefined, requestParameters),

	postShares: (id: string, users: BLTypes.BLShareInfo, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.post<BLTypes.BLResponse>(blacklabPaths.shares(id),
			// Need to manually set content-type due to long-standing axios bug
			// https://github.com/axios/axios/issues/362
			qs.stringify({users: users.map(u => u.trim()).filter(u => u.length)}, {arrayFormat: 'brackets'}),
			{
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
				}
			}
		),

	postFormat: (name: string, contents: string, requestParameters?: AxiosRequestConfig) => {
		const data = new FormData();
		data.append('data', new File([contents], name, {type: 'text/plain'}), name);
		return endpoints.blacklab.post<BLTypes.BLResponse>(blacklabPaths.formats(), data, requestParameters);
	},

	postCorpus: (id: string, displayName: string, format: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.post(blacklabPaths.root(),
			qs.stringify({name: id, display: displayName, format}),
			{
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
				}
			}
		),

	postDocuments: (
		indexId: string,
		docs: File[],
		meta?: File[]|null,
		onProgress?: (percentage: number) => any,
		requestParameters?: AxiosRequestConfig
	) => {
		const formData = new FormData();
		for (let i = 0; i < (docs ? docs.length : 0); ++i) {
			formData.append('data', docs[i], docs[i].name);
		}
		for (let i = 0; i < (meta ? meta.length : 0); ++i) {
			formData.append('linkeddata', meta![i], meta![i].name);
		}

		const cancelToken = axios.CancelToken.source();
		return {
			request: endpoints.blacklab.post<BLTypes.BLResponse>(blacklabPaths.documentUpload(indexId), formData, {
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					'Content-Type': 'multipart/form-data',
				},
				onUploadProgress: (event: ProgressEvent) => {
					if (onProgress) {
						onProgress(event.loaded / event.total * 100);
					}
				},
				cancelToken: cancelToken.token
			}),
			cancel: cancelToken.cancel
		};
	},

	deleteFormat: (id: string) => endpoints.blacklab
		.delete<BLTypes.BLResponse>(blacklabPaths.formatContent(id)),

	deleteCorpus: (id: string) => endpoints.blacklab
		.delete<BLTypes.BLResponse>(blacklabPaths.index(id)),

	getDocumentInfo: (indexId: string, documentId: string, params: { query?: string; } = {}, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.getOrPost<BLTypes.BLDocument>(blacklabPaths.docInfo(indexId, documentId), params, requestParameters),

	getRelations: (indexId: string, requestParameters?: AxiosRequestConfig) => endpoints.blacklab
		.get<BLTypes.BLRelationInfo>(blacklabPaths.relations(indexId), undefined, requestParameters),

	getParsePattern: (indexId: string, pattern: string, requestParameters?: AxiosRequestConfig) => {
		let request: Promise<{ parsed: { bcql: string, json: any } }>;
		if (!indexId) {
			request = Promise.reject(new ApiError('Error', 'No index specified.', 'Internal error', undefined));
		} else if (!pattern) {
			request = Promise.reject(new ApiError('Info', 'Cannot parse without pattern.', 'No results', undefined));
		} else {
			request = endpoints.blacklab.getOrPost(blacklabPaths.parsePattern(indexId), { patt: pattern }, { ...requestParameters });
		}
		return request;
	},

	getHits: (indexId: string, params: BLTypes.BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
		const {token: cancelToken, cancel} = axios.CancelToken.source();

		let request: Promise<BLTypes.BLHitResults|BLTypes.BLHitGroupResults>;
		if (!indexId) {
			request = Promise.reject(new ApiError('Error', 'No index specified.', 'Internal error', undefined));
		} else if (!params.patt) {
			request = Promise.reject(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
		} else {
			request = endpoints.blacklab.getOrPost(blacklabPaths.hits(indexId), params, { ...requestParameters, cancelToken });
		}

		return {
			request,
			cancel
		};
	},

	getHitsCsv: (indexId: string, params: BLTypes.BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
		const {token: cancelToken, cancel} = axios.CancelToken.source();
		const csvParams = Object.assign({}, params, {
			number: undefined,
			first: undefined,
			outputformat: 'csv'
		});

		let request: Promise<Blob>;
		if (!indexId) {
			request = Promise.reject(new ApiError('Error', 'No index specified.', 'Internal error', undefined));
		} else if (!params.patt) {
			request = Promise.reject(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
		} else {
			request = endpoints.blacklab.getOrPost(blacklabPaths.hitsCsv(indexId), csvParams, {
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					Accept: 'text/csv'
				},
				responseType: 'blob',
				transformResponse: (data: any) => new Blob([data], {type: 'text/plain;charset=utf-8' }),
				cancelToken,
			});
		}

		return {
			request,
			cancel
		};
	},

	getDocsCsv(indexId: string, params: BLTypes.BLSearchParameters, requestParameters?: AxiosRequestConfig) {
		const {token: cancelToken, cancel} = axios.CancelToken.source();
		const csvParams = Object.assign({}, params, {
			number: undefined,
			first: undefined,
			outputformat: 'csv'
		});

		let request: Promise<Blob>;
		if (!indexId) {
			request = Promise.reject(new ApiError('Error', 'No index specified', 'Internal error', undefined));
		} else {
			request = endpoints.blacklab.getOrPost<Blob>(blacklabPaths.docsCsv(indexId), csvParams, {
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					Accept: 'text/csv'
				},
				responseType: 'blob',
				transformResponse: (data: any) => new Blob([data], {type: 'text/plain;charset=utf-8' }),
				cancelToken,
			});
		}

		return {
			request,
			cancel
		};
	},

	getDocs: <T extends BLTypes.BLDocResults|BLTypes.BLDocGroupResults = BLTypes.BLDocResults|BLTypes.BLDocGroupResults> (indexId: string, params: BLTypes.BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
		const {token: cancelToken, cancel} = axios.CancelToken.source();

		let request: Promise<T>;
		if (!indexId) {
			request = Promise.reject(new ApiError('Error', 'No index specified', 'Internal error', undefined));
		} else {
			request = endpoints.blacklab.getOrPost<T>(blacklabPaths.docs(indexId), params, { ...requestParameters, cancelToken })
		}

		return {
			request,
			cancel
		};
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
	getSnippet: (indexId: string, docId: string, field: string|undefined, hitstart: number, hitend: number, context?: string|number, requestParameters?: AxiosRequestConfig) => {
		return endpoints.blacklab.getOrPost<BLTypes.BLHit>(blacklabPaths.snippet(indexId, docId), {
			hitstart,
			hitend,
			context,
			field,
		}, requestParameters)
		.then<BLTypes.BLHit>(r => {
			// BlackLab doesn't always return the left/right/before/after context fields (at document boundaries)
			// Fill them in with blanks to simplify rendering code.
			if (!r.left) r.left = Object.entries(r.match).reduce((acc, [key, value]) => { acc[key] = []; return acc; }, {} as BLTypes.BLHitSnippetPart);
			if (!r.right) r.right = Object.entries(r.match).reduce((acc, [key, value]) => { acc[key] = []; return acc; }, {} as BLTypes.BLHitSnippetPart);
			return r;
		});
	},

	getTermFrequencies: (indexId: string, annotationId: string, values?: string[], filter?: string, number = 20, requestParameters?: AxiosRequestConfig) => {
		return endpoints.blacklab.getOrPost<BLTypes.BLTermOccurances>(blacklabPaths.termFrequencies(indexId), {
			annotation: annotationId,
			filter,
			terms: values && values.length ? values.join(',') : undefined,
			number
		}, requestParameters);
	},

	getTermAutocomplete: (indexId: string, annotatedFieldId: string, annotationId: string, prefix: string, requestParameters?: AxiosRequestConfig) => {
		return endpoints.blacklab.getOrPost<string[]>(blacklabPaths.autocompleteAnnotation(
			indexId,
			annotatedFieldId,
			annotationId
		), {
			term: prefix
		}, requestParameters)
	},
};

/**
 * API for corpus-frontend's own webservice
 */
export const frontend = {
	getCorpus: () => endpoints.cf.get<BLTypes.BLIndexMetadata>(frontendPaths.indexInfo()),

	getDocumentContents: (pid: string, params: {
		patt?: string,
		pattgapdata?: string,
		wordstart?: number,
		wordend?: number,
	}) => endpoints.cf
		.get<string>(frontendPaths.documentContents(pid), params),

	getDocumentMetadata: (pid: string) => endpoints.cf
		.get<BLTypes.BLDocument>(frontendPaths.documentMetadata(pid)),
}

export const glossPaths = {
	root: () => './',
	glosses: () => `GlossStore` // NOTE: no trailing slash!
}

export const glossApi = {
	getCql: (instance: string, corpus: string, query: string) => endpoints.gloss
		.get<''|Glossing[]>(glossPaths.glosses(), {instance,corpus,query})
		.then(glossings => !glossings ? '' : glossings
			.filter(g => g.hit_first_word_id?.length > 3)
			.map(g => {
				if (g.hit_first_word_id !== g.hit_last_word_id)
					return `([_xmlid='${g.hit_first_word_id}'][]*[_xmlid='${g.hit_last_word_id}'])`;
				else
					return `([_xmlid='${g.hit_first_word_id}'])`
			})
			.join("| ")
		),
	storeGlosses: (instance: string, glossings: Glossing[]) => endpoints.gloss
		.post(glossPaths.glosses(), qs.stringify({
			instance,
			glossings: JSON.stringify(glossings)
		})),
	getGlosses: (instance: string, corpus: string, hitIds: string[]) => endpoints.gloss
		.get<Glossing[]>(glossPaths.glosses(), {instance,corpus,hitIds: JSON.stringify(hitIds)}),

}

/** API of the concept implementation is a bit weird. Everything happens through query parameters mostly. */
export const conceptPaths = {
	api: () => `api`,
	cql: () => `BlackPaRank`,
}

export const conceptApi = {
	/** Data contains duplicates currently. */
	getMainFields: (instance: string, corpus: string) => endpoints.concept
		.get<{data: LexiconEntry[]}>(conceptPaths.api(), {
			instance,
			query: `query Quine { lexicon(corpus : "${corpus}") { field } }`
		}),
	addConceptOrTermToDatabase: (
		instance: string,
		corpus: string,
		field: string,
		concept: string,
		/** When omitted, only the concept is added to the database. */
		term?: string
	) => endpoints.concept.get(conceptPaths.api(), {
		instance,
		insertTerm: term
			? { corpus, field, concept, term }
			: { corpus, field, concept }
	}),
	getConcepts: (
		instance: string,
		field: string,
		prefix?: string
	) => endpoints.concept.get<{data: {data: Array<{cluster: string}>}}>(conceptPaths.api(), {
		instance,
		query: `query Quine { lexicon (${prefix ? `cluster: "/^${prefix}/",` : ''} field: "${field}") { field, cluster, term } }`
	}).then(r => uniq(r.data.data.map(x => x.cluster))),
	getTerms: (
		instance: string,
		field: string,
		concept: string,
		/** Optionally, return a list only with those terms starting with the prefix. All terms returned otherwise. */
		prefix?: string
	) => endpoints.concept.get<{data: {data: Array<{term: string}>}}>(conceptPaths.api(), {
		instance,
		query: `query Quine { lexicon (${prefix ? `term: "/^${prefix}/",` : ''} field: "${field}", cluster: "${concept}") { field, cluster, term } }`
	}).then(r => uniq(r.data.data.map(x => x.term))),
	translate_query_to_cql: (
		blacklabBackendEndpoint: string,
		corpus: string,
		element: string,
		queries: Record<string, AtomicQuery[]>,
	): Promise<{pattern: string}> => endpoints.concept
		.get<{pattern: string}>(conceptPaths.cql(), {
			server: blacklabBackendEndpoint,
			corpus,
			action: 'info',
			query: JSON.stringify({
				element,
				strict: true,
				filter: '',
				queries
			})
		}, {
			headers: {
				Accept: 'application/json'
			},
		}),
}

export {Canceler, ApiError};
