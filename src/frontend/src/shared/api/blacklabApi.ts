import type { AxiosRequestConfig } from 'axios';
import { stripIndent } from 'common-tags';

import {
	isHitParams,
	type BLAnnotatedField,
	type BLDocGroupResultsV4,
	type BLDocGroupResults,
	type BLDocResultsV4,
	type BLDocResults,
	type BLDocResultsV5,
	type BLDocument,
	type BLDocumentV4,
	type BLFormatContent,
	type BLFormats,
	type BLHitV4,
	type BLHitV5,
	type BLHitGroupResultsV4,
	type BLHitGroupResults,
	type BLHitResultsV4,
	type BLHitResults,
	type BLHitResultsV5,
	type BLIndex,
	type BLIndexV4,
	type BLIndexMetadata,
	type BLIndexMetadataV4,
	type BLParsePatternResponse,
	type BLRelationInfo,
	type BLResponse,
	type BLSearchParameters,
	type BLServer,
	type BLServerV4,
	type BLShareInfo,
	type BLTermOccurances,
} from '@/types/blacklabtypes';

import { type EndpointSettings, type QueryParamsMapper, type QueryParamsMapperReturn, createEndpoint } from '@/shared/api/lib/api-endpoint';
import { ApiError, CancelableRequest, type BlackLabApi, type BlackLabPaths } from '@/shared/api/lib/api-types';
import { rejectedRequest } from '@/shared/api/lib/api-utils';
import { normalizeFormat, normalizeIndex, normalizeIndexBase, normalizeServerInfo } from '@/shared/blacklab-helpers/normalize/normalize-corpus';
import { normalizeDoc, normalizeDocResponse, normalizeHit, normalizeHitResponse } from '@/shared/blacklab-helpers/normalize/normalize-results';

/** Contains url mappings for different requests to blacklab-server */
const blacklabPathsV4: BlackLabPaths = {
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
	field: (indexId: string, fieldName: string) => `${indexId}/fields/${encodeURIComponent(fieldName)}/`,

	/** Retrieve the relations/inline tags in the corpus. Since 4.0 */
	relations: (indexId: string) => `${indexId}/relations/`,
	documentUpload: (indexId: string) => `${indexId}/docs/`,
	shares: (indexId: string) => `${indexId}/sharing/`,
	formats: () => `input-formats/`,
	formatContent: (id: string) => `input-formats/${encodeURIComponent(id)}/`,
	formatXslt: (id: string) => `input-formats/${encodeURIComponent(id)}/xslt`,

	docInfo: (indexId: string, docId: string) => `${indexId}/docs/${encodeURIComponent(docId)}/`,
	hits: (indexId: string) => `${indexId}/hits/`,
	hitsCsv: (indexId: string) => `${indexId}/hits-csv/`,
	docs: (indexId: string) => `${indexId}/docs/`,
	docsCsv: (indexId: string) => `${indexId}/docs-csv/`,
	snippet: (indexId: string, docId: string) => `${indexId}/docs/${encodeURIComponent(docId)}/snippet/`,
	parsePattern: (indexId: string) => `${indexId}/parse-pattern/`,

	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteAnnotation: (indexId: string, annotatedFieldId: string, annotationId: string) => `${indexId}/autocomplete/${encodeURIComponent(annotatedFieldId)}/${encodeURIComponent(annotationId)}/`,
	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteMetadata: (indexId: string, metadataFieldId: string) => `${indexId}/autocomplete/${encodeURIComponent(metadataFieldId)}/`,
	termFrequencies: (indexId: string) => `${indexId}/termfreq/`,
};

/** Contains url mappings for different requests to blacklab-server */
const blacklabPathsV5: BlackLabPaths = {
	/*
		Stupid issue, sending a request to /blacklab-server redirects to /blacklab-server/
		Problem is, the redirect response is missing the CORS header
		so the browser doesn't allow the redirect.
		There doesn't seem to be a way to fix this in the server as the redirect
		is performed by the servlet container and runs before any application code.
		So ensure our requests end with a trailing slash to prevent the server from redirecting
	*/
	root: () => './',
	index: (indexId: string) => `corpora/${indexId}/`,
	indexStatus: (indexId: string) => `corpora/${indexId}/status/`,
	field: (indexId: string, fieldName: string) => `corpora/${indexId}/fields/${encodeURIComponent(fieldName)}/`,

	/** Retrieve the relations/inline tags in the corpus. Since 4.0 */
	relations: (indexId: string) => `corpora/${indexId}/relations/`,
	documentUpload: (indexId: string) => `corpora/${indexId}/docs/`,
	shares: (indexId: string) => `corpora/${indexId}/sharing/`,
	formats: () => `input-formats/`,
	formatContent: (id: string) => `input-formats/${encodeURIComponent(id)}/`,
	formatXslt: (id: string) => `input-formats/${encodeURIComponent(id)}/xslt`,

	docInfo: (indexId: string, docId: string) => `corpora/${indexId}/docs/${encodeURIComponent(docId)}/`,
	hits: (indexId: string) => `corpora/${indexId}/hits/`,
	hitsCsv: (indexId: string) => `corpora/${indexId}/hits-csv/`,
	docs: (indexId: string) => `corpora/${indexId}/docs/`,
	docsCsv: (indexId: string) => `corpora/${indexId}/docs-csv/`,
	snippet: (indexId: string, docId: string) => `corpora/${indexId}/docs/${encodeURIComponent(docId)}/snippet/`,
	parsePattern: (indexId: string) => `corpora/${indexId}/parse-pattern/`,

	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteAnnotation: (indexId: string, annotatedFieldId: string, annotationId: string) =>
		`corpora/${indexId}/autocomplete/${encodeURIComponent(annotatedFieldId)}/${encodeURIComponent(annotationId)}/`,
	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteMetadata: (indexId: string, metadataFieldId: string) => `corpora/${indexId}/autocomplete/${encodeURIComponent(metadataFieldId)}/`,
	termFrequencies: (indexId: string) => `corpora/${indexId}/termfreq/`,
};

type BlackLabApiSettings = EndpointSettings & {
	apiVersion?: string | null;
};

function getMajorBlackLabVersion(apiVersion: string): '4' | '5' {
	if (apiVersion.startsWith('4')) return '4';
	if (apiVersion.startsWith('5')) return '5';
	console.warn('Unsupported BlackLab version: ' + apiVersion);
	// best effort? Just to prevent a potential compatible version bump in the future from
	// retroactively breaking all old frontends
	return '5';
}

async function getBlackLabVersion(endpoint: string, apiVersion?: string | null): Promise<'4' | '5'> {
	if (apiVersion) return getMajorBlackLabVersion(apiVersion);

	const { origin, pathname, searchParams } = new URL(endpoint, window.location.origin);
	searchParams.set('outputformat', 'json');
	const url = `${origin}${pathname}?${searchParams.toString()}`;

	const response = await fetch(url, { method: 'GET' }).then<BLServer | BLServerV4>(r => r.json());

	if (!response.apiVersion) {
		throw new Error('Invalid response from BlackLab server: missing apiVersion');
	}
	return getMajorBlackLabVersion(response.apiVersion);
}

/** Map some renamed query params from V5 to V4 */
export const mapV5ParamsToV4: QueryParamsMapper<BLSearchParameters> = v => {
	const r: QueryParamsMapperReturn = { ...v };
	delete r.subcorpussize;
	r.includetokencount = v.subcorpussize;
	return r;
};

/**
 * Blacklab api
 */
export const createBlackLabApi = async (settings: Omit<BlackLabApiSettings, 'mapQueryParams'>): Promise<{ api: BlackLabApi; paths: BlackLabPaths }> => {
	const version = await getBlackLabVersion(settings.baseUrl, settings.apiVersion);
	const paths = version === '4' ? blacklabPathsV4 : blacklabPathsV5;

	const endpoint = createEndpoint({
		...settings,
		mapQueryParams: version === '4' ? mapV5ParamsToV4 : undefined,
	});
	const api: BlackLabApi = {
		getServerInfo: (requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<BLServer | BLServerV4>(paths.root(), undefined, requestParameters).then(normalizeServerInfo),

		getUser: (requestParameters?: AxiosRequestConfig) =>
			endpoint
				.getCancelable<BLServer | BLServerV4>(paths.root(), undefined, requestParameters)
				.then(normalizeServerInfo)
				.then(r => r.user),

		getCorpora: (requestParameters?: AxiosRequestConfig) =>
			endpoint
				.getCancelable<BLServer | BLServerV4>(paths.root(), undefined, requestParameters)
				.then(normalizeServerInfo)
				.then(r => Object.values(r.corpora)),

		getCorpusStatus: (id: string, requestParamers?: AxiosRequestConfig) =>
			endpoint.getCancelable<BLIndex | BLIndexV4>(paths.indexStatus(id), undefined, requestParamers).then(r => normalizeIndexBase(r, id)),

		getCorpus: (id: string, requestParameters?: AxiosRequestConfig) => {
			const indexRequest = endpoint.getCancelable<BLIndexMetadata | BLIndexMetadataV4>(paths.index(id), version === '5' ? { custom: true } : undefined, {
				...requestParameters,
				data: {
					...requestParameters?.data,
					listValues: '*', // blacklab 5 allows this, 4 doesn't respect it, but doesn't harm
				},
			});
			const relationsRequest = api.getRelations(id, requestParameters);
			return new CancelableRequest(Promise.all([indexRequest, relationsRequest]), () => {
				indexRequest.cancel();
				relationsRequest.cancel();
			})
				.then(([index, relations]) => normalizeIndex(index, relations))
				.catch<never>(e => {
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
								Corpus '${id}' not found.<br>
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
				});
		},

		getAnnotatedField: (indexId: string, fieldName: string, requestParameters?: AxiosRequestConfig) =>
			endpoint.getCancelable<BLAnnotatedField>(paths.field(indexId, fieldName), undefined, requestParameters),

		getShares: (id: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<{ 'users[]': BLShareInfo }>(paths.shares(id), undefined, requestParameters).then(r => r['users[]']),

		getFormats: (requestParameters?: AxiosRequestConfig) =>
			endpoint
				.getCancelable<BLFormats>(paths.formats(), undefined, requestParameters)
				.then(r => Object.entries(r.supportedInputFormats))
				.then(r => r.map(([id, format]) => normalizeFormat(id, format))),

		getFormatContent: (id: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<BLFormatContent>(paths.formatContent(id), undefined, requestParameters),

		getFormatXslt: (id: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<string>(paths.formatXslt(id), undefined, requestParameters),

		postShares: (id: string, users: BLShareInfo, requestParameters?: AxiosRequestConfig) =>
			endpoint.postCancelable<BLResponse>(
				paths.shares(id),
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
			return endpoint.postCancelable<BLResponse>(paths.formats(), data, requestParameters);
		},

		postCorpus: (id: string, displayName: string, format: string, requestParameters?: AxiosRequestConfig) =>
			endpoint.postCancelable<BLResponse>(paths.root(), new URLSearchParams({ name: id, display: displayName, format }), {
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

			return endpoint.postCancelable<BLResponse>(paths.documentUpload(indexId), formData, {
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

		deleteFormat: (id: string, requestParameters?: AxiosRequestConfig) => endpoint.deleteCancelable<BLResponse>(paths.formatContent(id) + '?api=4', requestParameters),

		deleteCorpus: (id: string, requestParameters?: AxiosRequestConfig) => endpoint.deleteCancelable<BLResponse>(paths.index(id), requestParameters),

		getDocumentInfo: (indexId: string, documentId: string, params: { query?: string } = {}, requestParameters?: AxiosRequestConfig) => {
			if (version === '4') return endpoint.getOrPostCancelable<BLDocumentV4>(paths.docInfo(indexId, documentId), params, requestParameters).then(r => normalizeDoc(r));
			else return endpoint.getOrPostCancelable<BLDocument>(paths.docInfo(indexId, documentId), params, requestParameters);
		},

		getRelations: (indexId: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<BLRelationInfo>(paths.relations(indexId), { limitvalues: 1000 }, requestParameters),

		getParsePattern: (indexId: string, pattern: string, requestParameters?: AxiosRequestConfig) => {
			if (!indexId) {
				return rejectedRequest(new ApiError('Error', 'No index specified.', 'Internal error', undefined));
			} else if (!pattern) {
				return rejectedRequest(new ApiError('Info', 'Cannot parse without pattern.', 'No results', undefined));
			} else {
				return endpoint.getOrPostCancelable<BLParsePatternResponse>(paths.parsePattern(indexId), { patt: pattern }, { ...requestParameters });
			}
		},

		getHits: <T extends BLHitResults | BLHitGroupResults = BLHitResults | BLHitGroupResults>(indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
			if (!isHitParams(params)) return rejectedRequest(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
			const searchParams = { ...params, subcorpussize: true }; // always request this without mutating URL/store state
			if (version === '4') {
				return endpoint.getOrPostCancelable<BLHitResultsV4 | BLHitGroupResultsV4>(paths.hits(indexId), searchParams, requestParameters).then(r => normalizeHitResponse(r) as T);
			} else {
				return endpoint.getOrPostCancelable<BLHitResultsV5 | BLHitGroupResults>(paths.hits(indexId), searchParams, requestParameters).then(r => normalizeHitResponse(r) as T);
			}
		},

		getHitsCsv: (indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
			const csvParams = Object.assign({}, params, {
				number: undefined,
				first: undefined,
				outputformat: 'csv',
			});

			if (!isHitParams(params)) {
				return rejectedRequest(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
			} else {
				return endpoint.getOrPostCancelable<Blob>(paths.hitsCsv(indexId), csvParams, {
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

		getDocsCsv(indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig) {
			const csvParams = Object.assign({}, params, {
				number: undefined,
				first: undefined,
				outputformat: 'csv',
			});

			return endpoint.getOrPostCancelable<Blob>(paths.docsCsv(indexId), csvParams, {
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					Accept: 'text/csv',
				},
				responseType: 'blob',
				transformResponse: (data: any) => new Blob([data], { type: 'text/plain;charset=utf-8' }),
			});
		},

		getDocs: <T extends BLDocResults | BLDocGroupResults = BLDocResults | BLDocGroupResults>(
			indexId: string,
			params: BLSearchParameters,
			requestParameters?: AxiosRequestConfig,
		): CancelableRequest<T> => {
			const searchParams = { ...params, subcorpussize: true }; // always request this
			return version === '4'
				? endpoint.getOrPostCancelable<BLDocResultsV4 | BLDocGroupResultsV4>(paths.docs(indexId), searchParams, requestParameters).then(r => normalizeDocResponse(r) as T)
				: endpoint.getOrPostCancelable<BLDocResultsV5 | BLDocGroupResults>(paths.docs(indexId), searchParams, requestParameters).then(r => normalizeDocResponse(r) as T);
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
			return endpoint.getOrPostCancelable<BLHitV4 | BLHitV5>(paths.snippet(indexId, docId), { hitstart, hitend, context, field }, requestParameters).then(h => normalizeHit(h, docId));
		},

		getTermFrequencies: (indexId: string, annotationId: string, values?: string[], filter?: string, number = 20, requestParameters?: AxiosRequestConfig) => {
			return endpoint.getOrPostCancelable<BLTermOccurances>(
				paths.termFrequencies(indexId),
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
			return endpoint.getOrPostCancelable<string[]>(paths.autocompleteAnnotation(indexId, annotatedFieldId, annotationId), { term: prefix }, requestParameters);
		},

		getMetadataAutocomplete: (indexId: string, metadataFieldId: string, prefix: string, requestParameters?: AxiosRequestConfig) => {
			return endpoint.getOrPostCancelable<string[]>(paths.autocompleteMetadata(indexId, metadataFieldId), { term: prefix }, requestParameters);
		},
	};
	return { api, paths };
};
