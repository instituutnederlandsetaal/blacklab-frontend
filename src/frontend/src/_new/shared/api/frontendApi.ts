import type { Endpoint } from "@/_new/shared/api/lib/api-endpoint";
import type { DocumentContentsParameters, FrontendApi } from "@/_new/shared/api/lib/api-types";
import { ApiError, type CFPageConfig, type Tagset } from "@/types/apptypes";
import type { BLIndexMetadata } from "@/types/blacklabtypes";
import axios, { type AxiosRequestConfig } from "axios";
import { stripIndent } from "common-tags";

export const frontendPaths = {
	root: () => CONTEXT_URL,
	currentCorpus: (indexId: string) => `${CONTEXT_URL}/${indexId}/search`,
	/** Get the URL for displaying the document/article in the Frontend, with various highlighting and pagination params. */
	documentPage: (p: {
		indexId: string,
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
	config: (indexId: string|null) => indexId ? `${indexId}/api/config` : `api/config`,
	tagset: (indexId: string) => `${indexId}/static/tagset.json`,
	documentContents: (indexId: string, pid: string) => `${indexId}/api/docs/${pid}/contents`,
	documentMetadata: (indexId: string, pid: string) => `${indexId}/api/docs/${pid}`,

	help: (indexId?: string) => `${indexId ? indexId + '/' : '' }api/help`,
	about: (indexId?: string) => `${indexId ? indexId + '/' : '' }api/about`,
}

/**
 * API for blacklab-frontend's own webservice
 */
export const createFrontendApi = (endpoint: Endpoint): FrontendApi => ({
	getCorpus: (indexId: string, requestParameters?: AxiosRequestConfig) => endpoint
		.getCancelable<BLIndexMetadata>(frontendPaths.indexInfo(indexId), undefined, requestParameters)
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
						Corpus '${indexId}' not found.<br>
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
		}),
	getConfig: (indexId: string|null, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<CFPageConfig>(frontendPaths.config(indexId), undefined, requestParameters),

	/** Get transformed document contents */
	getDocumentContents: (params: DocumentContentsParameters, requestParameters?: AxiosRequestConfig) => endpoint
		.getCancelable<string>(frontendPaths.documentContents(params.indexId, params.docId), params, requestParameters),

	/** Get transformed document metadata */
	getDocumentMetadata: (indexId: string, pid: string, requestParameters?: AxiosRequestConfig) => endpoint
		.getCancelable<string>(frontendPaths.documentMetadata(indexId, pid), undefined, requestParameters),

	/** Get html content of the help page. */
	getHelp: (indexId?: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<string>(frontendPaths.help(indexId), undefined, requestParameters),
	/** Get html content of the about page. */
	getAbout: (indexId?: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<string>(frontendPaths.about(indexId), undefined, requestParameters),
	getTagset: (indexId: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<Tagset>(frontendPaths.tagset(indexId), undefined, {
		...requestParameters,
		// Remove comment-lines in the returned json. (that's not strictly allowed by JSON, but we chose to support it)
		transformResponse: [(r: string) => r.replace(/\/\/.*[\r\n]+/g, '')].concat(axios.defaults.transformResponse!)
	})
});