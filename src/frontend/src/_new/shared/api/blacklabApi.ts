import { type EndpointSettings, createEndpoint } from "@/_new/shared/api/lib/api-endpoint";
import { ApiError, type BlackLabApi } from "@/_new/shared/api/lib/api-types";
import { rejectedRequest } from "@/_new/shared/api/lib/api-utils";
import type { BLAnnotatedField, BLDocGroupResults, BLDocResults, BLDocument, BLFormatContent, BLFormats, BLHit, BLHitGroupResults, BLHitResults, BLHitSnippetPart, BLIndex, BLIndexMetadata, BLParsePatternResponse, BLRelationInfo, BLResponse, BLSearchParameters, BLServer, BLShareInfo, BLTermOccurances } from "@/types/blacklabtypes";
import { isHitParams } from "@/utils";
import { normalizeFormat, normalizeIndex, normalizeIndexBase } from "@/utils/blacklabutils";
import { CancelableRequest } from "@/utils/loadable-streams";
import type { AxiosRequestConfig } from "axios";
import { stripIndent } from "common-tags";


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
		annotationId: string) =>                    `${indexId}/autocomplete/${annotatedFieldId}/${annotationId}/`,
	// Is used outside the axios endpoint we created above, so prefix with the correct location
	autocompleteMetadata: (
		indexId: string,
		metadataFieldId: string) =>                 `${indexId}/autocomplete/${metadataFieldId}/`,
	termFrequencies: (indexId: string) =>           `${indexId}/termfreq/`,
};


/**
 * Blacklab api
 */
export const createBlackLabApi = (settings: EndpointSettings): BlackLabApi => {
	const endpoint = createEndpoint(settings);
	const api: BlackLabApi = {
		getServerInfo: (requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<BLServer>(blacklabPaths.root(), undefined, requestParameters),

		getUser: (requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<BLServer>(blacklabPaths.root(), undefined, requestParameters)
			.then(r => r.user),

		getCorpora: (requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<BLServer>(blacklabPaths.root(), undefined, requestParameters)
			.then(r => Object.entries({...r.corpora, ...r.indices}).map(([id, c]) => normalizeIndexBase(c, id))),

		getCorpusStatus: (id: string, requestParamers?: AxiosRequestConfig) => endpoint
			.getCancelable<BLIndex>(blacklabPaths.indexStatus(id), undefined, requestParamers)
			.then(r => normalizeIndexBase(r, id)),

		getCorpus: (id: string, requestParameters?: AxiosRequestConfig) => {
			const indexRequest = endpoint.getCancelable<BLIndexMetadata>(blacklabPaths.index(id), undefined, requestParameters);
			const relationsRequest = api.getRelations(id, requestParameters);
			return new CancelableRequest(Promise.all([indexRequest, relationsRequest]), () => {indexRequest.cancel(); relationsRequest.cancel(); })
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
							throw new ApiError('Corpus not found',
								stripIndent`
								Corpus '${id}' not found.<br>
								Please check the spelling, or go to <a href="${CONTEXT_URL}">${CONTEXT_URL}</a> to get a list of available corpora.<br>
								If it's not there, refer to the documentation at <a href="https://blacklab.ivdnt.org" target="_blank">https://blacklab.ivdnt.org</a> and check your configuration.`,
								e.statusText,
								e.httpCode
							);
						} else {
							// No blacklab response; something isn't configured correctly.
							throw new ApiError('Corpus not found',
								stripIndent`
								Unable to contact BlackLab Server (or blacklab-frontend's own server component).<br> 
								Make sure both .war applications have been deployed, and your properties file<br>
								is in the correct location and has the correct name.<br>
								Refer to the documentation at <a href="https://blacklab.ivdnt.org" target="_blank">https://blacklab.ivdnt.org</a>`,
								e.statusText,
								e.httpCode
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

		getAnnotatedField: (indexId: string, fieldName: string, requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<BLAnnotatedField>(blacklabPaths.field(indexId, fieldName), undefined, requestParameters),

		getShares: (id: string, requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<{'users[]': BLShareInfo}>(blacklabPaths.shares(id), undefined, requestParameters)
			.then(r => r['users[]']),

		getFormats: (requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<BLFormats>(blacklabPaths.formats(), undefined, requestParameters)
			.then(r => Object.entries(r.supportedInputFormats))
			.then(r => r.map(([id, format]) => normalizeFormat(id, format))),

		getFormatContent: (id: string, requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<BLFormatContent>(blacklabPaths.formatContent(id), undefined, requestParameters),

		getFormatXslt: (id: string, requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<string>(blacklabPaths.formatXslt(id), undefined, requestParameters),

		postShares: (id: string, users: BLShareInfo, requestParameters?: AxiosRequestConfig) => endpoint
			.postCancelable<BLResponse>(blacklabPaths.shares(id),
				users.reduce((params, user) => {
					const trimmed = user.trim();
					if (trimmed) params.append('users[]', trimmed);
					return params;
				}, new URLSearchParams()),
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
			return endpoint.postCancelable<BLResponse>(blacklabPaths.formats(), data, requestParameters);
		},

		postCorpus: (id: string, displayName: string, format: string, requestParameters?: AxiosRequestConfig) => endpoint
			.postCancelable<BLResponse>(blacklabPaths.root(),
				new URLSearchParams({name: id, display: displayName, format}),
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

			return endpoint.postCancelable<BLResponse>(blacklabPaths.documentUpload(indexId), formData, {
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
			});
		},

		deleteFormat: (id: string, requestParameters?: AxiosRequestConfig) => endpoint
			.deleteCancelable<BLResponse>(blacklabPaths.formatContent(id), requestParameters),

		deleteCorpus: (id: string, requestParameters?: AxiosRequestConfig) => endpoint
			.deleteCancelable<BLResponse>(blacklabPaths.index(id), requestParameters),

		getDocumentInfo: (indexId: string, documentId: string, params: { query?: string; } = {}, requestParameters?: AxiosRequestConfig) => endpoint
			.getOrPostCancelable<BLDocument>(blacklabPaths.docInfo(indexId, documentId), params, requestParameters),

		getRelations: (indexId: string, requestParameters?: AxiosRequestConfig) => endpoint
			.getCancelable<BLRelationInfo>(blacklabPaths.relations(indexId), { limitvalues: 1000 }, requestParameters),

		getParsePattern: (indexId: string, pattern: string, requestParameters?: AxiosRequestConfig) => {
			if (!indexId) {
				return rejectedRequest(new ApiError('Error', 'No index specified.', 'Internal error', undefined));
			} else if (!pattern) {
				return rejectedRequest(new ApiError('Info', 'Cannot parse without pattern.', 'No results', undefined));
			} else {
				return endpoint.getOrPostCancelable<BLParsePatternResponse>(
					blacklabPaths.parsePattern(indexId),
					{ patt: pattern },
					{ ...requestParameters }
				);
			}
		},

		getHits: <T extends BLHitResults|BLHitGroupResults = BLHitResults|BLHitGroupResults>(indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
			if (!isHitParams(params)) 
				return rejectedRequest(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
			else 
				return endpoint.getOrPostCancelable<T>(blacklabPaths.hits(indexId), params, requestParameters);
		},

		getHitsCsv: (indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig) => {
			const csvParams = Object.assign({}, params, {
				number: undefined,
				first: undefined,
				outputformat: 'csv'
			});

			if (!isHitParams(params)) {
				return rejectedRequest(new ApiError('Info', 'Cannot get hits without pattern.', 'No results', undefined));
			} else {
				return endpoint.getOrPostCancelable<Blob>(blacklabPaths.hitsCsv(indexId), csvParams, {
					...requestParameters,
					headers: {
						...(requestParameters || {}).headers,
						Accept: 'text/csv'
					},
					responseType: 'blob',
					transformResponse: (data: any) => new Blob([data], {type: 'text/plain;charset=utf-8' }),
				});
			}
		},

		getDocsCsv(indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig) {
			const csvParams = Object.assign({}, params, {
				number: undefined,
				first: undefined,
				outputformat: 'csv'
			});

			return endpoint.getOrPostCancelable<Blob>(blacklabPaths.docsCsv(indexId), csvParams, {
				...requestParameters,
				headers: {
					...(requestParameters || {}).headers,
					Accept: 'text/csv'
				},
				responseType: 'blob',
				transformResponse: (data: any) => new Blob([data], {type: 'text/plain;charset=utf-8' }),
			});
		},

		getDocs: <T extends BLDocResults|BLDocGroupResults = BLDocResults|BLDocGroupResults> (indexId: string, params: BLSearchParameters, requestParameters?: AxiosRequestConfig): CancelableRequest<T> => {
			return endpoint.getOrPostCancelable<T>(blacklabPaths.docs(indexId), params, requestParameters)
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
			return endpoint.getOrPostCancelable<BLHit>(blacklabPaths.snippet(indexId, docId), {
				hitstart,
				hitend,
				context,
				field,
			}, requestParameters)
			.then(r => {
				// BlackLab doesn't always return the left/right/before/after context fields (at document boundaries)
				// Fill them in with blanks to simplify rendering code.
				if (!r.left) r.left = Object.entries(r.match).reduce((acc, [key, value]) => { acc[key] = []; return acc; }, {} as BLHitSnippetPart);
				if (!r.right) r.right = Object.entries(r.match).reduce((acc, [key, value]) => { acc[key] = []; return acc; }, {} as BLHitSnippetPart);
				return r;
			})
		},

		getTermFrequencies: (indexId: string, annotationId: string, values?: string[], filter?: string, number = 20, requestParameters?: AxiosRequestConfig) => {
			return endpoint.getOrPostCancelable<BLTermOccurances>(blacklabPaths.termFrequencies(indexId), {
				annotation: annotationId,
				filter,
				terms: values && values.length ? values.join(',') : undefined,
				number
			}, requestParameters);
		},

		getTermAutocomplete: (indexId: string, annotatedFieldId: string, annotationId: string, prefix: string, requestParameters?: AxiosRequestConfig) => {
			return endpoint.getOrPostCancelable<string[]>(
				blacklabPaths.autocompleteAnnotation(indexId, annotatedFieldId, annotationId), 
				{ term: prefix }, 
				requestParameters
			)
		},

		getMetadataAutocomplete: (indexId: string, metadataFieldId: string, prefix: string, requestParameters?: AxiosRequestConfig) => {
			return endpoint.getOrPostCancelable<string[]>(
				blacklabPaths.autocompleteMetadata(indexId, metadataFieldId), 
				{ term: prefix }, 
				requestParameters
			)
		}
	};
return api;
}
