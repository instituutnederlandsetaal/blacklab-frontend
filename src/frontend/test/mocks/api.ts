import type { BLDocGroupResults, BLDocResults, BLHitGroupResults, BLHitResults } from '@/types/blacklabtypes';

import { createApiPlugin, type ApiPlugin, type ApiPluginParts } from '@/shared/api/plugin';
import { rejectedRequest as rejectedApiRequest, resolvedRequest } from '@/shared/api/lib/api-utils';
import { ApiError, type BlackLabApi, type BlackLabPaths, type CancelableRequest, type FrontendApi } from '@/shared/api/lib/api-types';

type ApiMethodReturnValue<TMethod> = TMethod extends (...args: any[]) => CancelableRequest<infer Value> ? Value : never;

export type MockApiReturnValues<TApi> = Partial<{
	[Method in keyof TApi]: ApiMethodReturnValue<TApi[Method]>;
}>;

export type MockApiOptions = {
	blacklab?: MockApiReturnValues<BlackLabApi>;
	frontend?: MockApiReturnValues<FrontendApi>;
	blacklabPaths?: Partial<BlackLabPaths>;
	overrides?: {
		blacklab?: Partial<BlackLabApi>;
		frontend?: Partial<FrontendApi>;
	};
};

type ApiMock = {
	blacklab: BlackLabApi;
	frontend: FrontendApi;
};

type ApiMockOverrides = {
	blacklab?: Partial<BlackLabApi>;
	frontend?: Partial<FrontendApi>;
};

const hasOwn = <T extends object>(object: T, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(object, key);

function unconfiguredMockApiError(methodName: string): ApiError {
	return new ApiError(
		'Mock API method not configured',
		`Mock API method "${methodName}" was called without a configured return value.`,
		'Mock API',
		undefined,
	);
}

export function rejectedRequest<T>(error: string | ApiError): CancelableRequest<T> {
	const apiError = typeof error === 'string' ? new ApiError('Mock API error', error, 'Mock API', undefined) : error;
	return rejectedApiRequest(apiError);
}

function mockResponse<TApi, Method extends keyof TApi>(apiName: string, returnValues: MockApiReturnValues<TApi>, method: Method): CancelableRequest<ApiMethodReturnValue<TApi[Method]>> {
	if (hasOwn(returnValues, method)) {
		return resolvedRequest(returnValues[method] as ApiMethodReturnValue<TApi[Method]>);
	}

	return rejectedRequest(unconfiguredMockApiError(`${apiName}.${String(method)}`));
}

export function createMockBlackLabApi(returnValues: MockApiReturnValues<BlackLabApi> = {}, overrides: Partial<BlackLabApi> = {}): BlackLabApi {
	const response = <Method extends keyof BlackLabApi>(method: Method): CancelableRequest<ApiMethodReturnValue<BlackLabApi[Method]>> => mockResponse<BlackLabApi, Method>('blacklab', returnValues, method);
	const api = {
		getServerInfo: () => response('getServerInfo'),
		getUser: () => response('getUser'),
		getCorpora: () => response('getCorpora'),
		getCorpusStatus: () => response('getCorpusStatus'),
		getCorpus: () => response('getCorpus'),
		getAnnotatedField: () => response('getAnnotatedField'),
		getShares: () => response('getShares'),
		getFormats: () => response('getFormats'),
		getFormatContent: () => response('getFormatContent'),
		getFormatXslt: () => response('getFormatXslt'),
		postShares: () => response('postShares'),
		postFormat: () => response('postFormat'),
		postCorpus: () => response('postCorpus'),
		postDocuments: () => response('postDocuments'),
		deleteFormat: () => response('deleteFormat'),
		deleteCorpus: () => response('deleteCorpus'),
		getDocumentInfo: () => response('getDocumentInfo'),
		getRelations: () => response('getRelations'),
		getParsePattern: () => response('getParsePattern'),
		getHits: <T extends BLHitResults | BLHitGroupResults = BLHitResults | BLHitGroupResults>() => response('getHits') as CancelableRequest<T>,
		getHitsCsv: () => response('getHitsCsv'),
		getDocsCsv: () => response('getDocsCsv'),
		getDocs: <T extends BLDocResults | BLDocGroupResults = BLDocResults | BLDocGroupResults>() => response('getDocs') as CancelableRequest<T>,
		getSnippet: () => response('getSnippet'),
		getTermFrequencies: () => response('getTermFrequencies'),
		getTermAutocomplete: () => response('getTermAutocomplete'),
		getMetadataAutocomplete: () => response('getMetadataAutocomplete'),
	} satisfies BlackLabApi;

	return {
		...api,
		...overrides,
	};
}

export function createMockFrontendApi(returnValues: MockApiReturnValues<FrontendApi> = {}, overrides: Partial<FrontendApi> = {}): FrontendApi {
	const response = <Method extends keyof FrontendApi>(method: Method): CancelableRequest<ApiMethodReturnValue<FrontendApi[Method]>> => mockResponse<FrontendApi, Method>('frontend', returnValues, method);
	const api = {
		getConfig: () => response('getConfig'),
		getDocumentContents: () => response('getDocumentContents'),
		getDocumentMetadata: () => response('getDocumentMetadata'),
		getHelp: () => response('getHelp'),
		getAbout: () => response('getAbout'),
		getTagset: () => response('getTagset'),
	} satisfies FrontendApi;

	return {
		...api,
		...overrides,
	};
}

function mockPath(name: string): (...parts: unknown[]) => string {
	return (...parts: unknown[]) => [name, ...parts.map(String)].join('/');
}

export function createMockBlackLabPaths(overrides: Partial<BlackLabPaths> = {}): BlackLabPaths {
	const paths = {
		root: mockPath('root'),
		index: mockPath('index'),
		indexStatus: mockPath('indexStatus'),
		field: mockPath('field'),
		relations: mockPath('relations'),
		documentUpload: mockPath('documentUpload'),
		shares: mockPath('shares'),
		formats: mockPath('formats'),
		formatContent: mockPath('formatContent'),
		formatXslt: mockPath('formatXslt'),
		docInfo: mockPath('docInfo'),
		hits: mockPath('hits'),
		hitsCsv: mockPath('hitsCsv'),
		docs: mockPath('docs'),
		docsCsv: mockPath('docsCsv'),
		snippet: mockPath('snippet'),
		parsePattern: mockPath('parsePattern'),
		autocompleteAnnotation: mockPath('autocompleteAnnotation'),
		autocompleteMetadata: mockPath('autocompleteMetadata'),
		termFrequencies: mockPath('termFrequencies'),
	} satisfies BlackLabPaths;

	return {
		...paths,
		...overrides,
	};
}

export function createMockApiParts(options: MockApiOptions = {}): ApiPluginParts {
	return {
		blacklabApi: createMockBlackLabApi(options.blacklab, options.overrides?.blacklab),
		frontendApi: createMockFrontendApi(options.frontend, options.overrides?.frontend),
		blacklabPaths: createMockBlackLabPaths(options.blacklabPaths),
	};
}

export function createMockApi(options: MockApiOptions = {}): ApiPlugin {
	return createApiPlugin(createMockApiParts(options));
}

export function createApiMock(overrides: ApiMockOverrides = {}): ApiMock {
	return {
		blacklab: createMockBlackLabApi({}, overrides.blacklab),
		frontend: createMockFrontendApi({}, overrides.frontend),
	};
}

export { resolvedRequest };
