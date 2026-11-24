import axios, { type AxiosRequestConfig } from 'axios';

import { type CFPageConfig, type Tagset } from '@/types/apptypes';

import { createEndpoint, type EndpointSettings } from '@/shared/api/lib/api-endpoint';
import type { ApiError, DocumentContentsParameters, FrontendApi } from '@/shared/api/lib/api-types';

const frontendPaths = {
	config: (indexId: string | null) => (indexId ? `${indexId}/api/config` : `api/config`),
	tagset: (indexId: string) => `${indexId}/static/tagset.json`,
	document: (indexId: string, pid: string) => `${encodeURIComponent(indexId)}/api/docs/${encodeURIComponent(pid)}`,

	help: (indexId?: string) => `${indexId ? indexId + '/' : ''}api/help`,
	about: (indexId?: string) => `${indexId ? indexId + '/' : ''}api/about`,
};

/**
 * API for blacklab-frontend's own webservice
 */
export const createFrontendApi = (settings: EndpointSettings): FrontendApi => {
	const endpoint = createEndpoint(settings);
	return {
		getConfig: (indexId: string | null, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<CFPageConfig>(frontendPaths.config(indexId), undefined, requestParameters),

		/** Get transformed document contents */
		getDocumentContents: ({ indexId, docId, viewField, ...params }: DocumentContentsParameters, requestParameters?: AxiosRequestConfig) => {
			// The servlet uses `field` for displayed contents; `searchfield` selects a different field for highlighting.
			if (!params.patt || params.searchfield === viewField) delete params.searchfield;
			return endpoint.getCancelable<string>(frontendPaths.document(indexId, docId) + '/contents', { ...params, ...(viewField ? { field: viewField } : {}) }, requestParameters);
		},

		/** Get transformed document metadata */
		getDocumentMetadata: (indexId: string, pid: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<string>(frontendPaths.document(indexId, pid), undefined, requestParameters),

		/** Get html content of the help page. */
		getHelp: (indexId?: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<string>(frontendPaths.help(indexId), undefined, requestParameters),
		/** Get html content of the about page. */
		getAbout: (indexId?: string, requestParameters?: AxiosRequestConfig) => endpoint.getCancelable<string>(frontendPaths.about(indexId), undefined, requestParameters),
		getTagset: (indexId: string, requestParameters?: AxiosRequestConfig) =>
			endpoint
				.getCancelable<Tagset | undefined>(frontendPaths.tagset(indexId), undefined, {
					...requestParameters,
					// Remove comment-lines in the returned json. (that's not strictly allowed by JSON, but we chose to support it)
					transformResponse: [(r: string) => r.replace(/\/\/.*[\r\n]+/g, '')].concat(axios.defaults.transformResponse!),
				})
				.catch((e: ApiError) => {
					// tagset isn't required, so if not found return undefined.
					if (e.httpCode === 404) return undefined;
					throw e;
				}),
	};
};
