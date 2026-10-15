import { vi, type Mock } from 'vitest';

import { ApiError, type BlackLabApi, type CancelableRequest, type FrontendApi } from '@/shared/api/lib/api-types';
import { rejectedRequest as rejectedApiRequest, resolvedRequest } from '@/shared/api/lib/api-utils';
import { createApiPlugin } from '@/shared/api/plugin';

type MockApiValue<TMethod> = TMethod extends (...args: infer Args) => CancelableRequest<infer Value> ? Value | ((...args: Args) => CancelableRequest<Value>) : never;

type MockApi<TApi> = {
	[Method in keyof TApi]: TApi[Method] extends (...args: never[]) => unknown ? TApi[Method] & Mock<TApi[Method]> : never;
};

export type MockApiReturnValues<TApi> = Partial<{
	[Method in keyof TApi]: MockApiValue<TApi[Method]>;
}>;

export type MockApiOptions = {
	blacklab?: MockApiReturnValues<BlackLabApi>;
	frontend?: MockApiReturnValues<FrontendApi>;
};

const hasOwn = <T extends object>(object: T, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(object, key);

function unconfiguredMockApiError(methodName: string): ApiError {
	return new ApiError('Mock API method not configured', `Mock API method "${methodName}" was called without a configured return value.`, 'Mock API', undefined);
}

export function rejectedRequest<T>(error: string | ApiError): CancelableRequest<T> {
	const apiError = typeof error === 'string' ? new ApiError('Mock API error', error, 'Mock API', undefined) : error;
	return rejectedApiRequest(apiError);
}

function mockMethods<TApi extends object>(apiName: string, returnValues: MockApiReturnValues<TApi>) {
	return <Method extends keyof TApi>(method: Method): MockApi<TApi>[Method] => {
		const methodName = `${apiName}.${String(method)}`;
		const mock = vi.fn((...args: unknown[]) => {
			if (hasOwn(returnValues, method)) {
				const value: unknown = returnValues[method];
				return typeof value === 'function' ? value(...args) : resolvedRequest(value);
			}
			console.warn(`Mock API method "${methodName}" was called without a configured return value.`);
			return rejectedRequest(unconfiguredMockApiError(methodName));
		});
		// Keep generic API signatures alongside Vitest's typed mock controls.
		return mock as unknown as MockApi<TApi>[Method];
	};
}

export function createMockBlackLabApi(returnValues: MockApiReturnValues<BlackLabApi> = {}): MockApi<BlackLabApi> {
	const method = mockMethods<BlackLabApi>('blacklab', returnValues);
	return {
		getServerInfo: method('getServerInfo'),
		getUser: method('getUser'),
		getCorpora: method('getCorpora'),
		getCorpusStatus: method('getCorpusStatus'),
		getCorpus: method('getCorpus'),
		getAnnotatedField: method('getAnnotatedField'),
		getShares: method('getShares'),
		getFormats: method('getFormats'),
		getFormatContent: method('getFormatContent'),
		getFormatXslt: method('getFormatXslt'),
		postShares: method('postShares'),
		postFormat: method('postFormat'),
		postCorpus: method('postCorpus'),
		postDocuments: method('postDocuments'),
		deleteFormat: method('deleteFormat'),
		deleteCorpus: method('deleteCorpus'),
		getDocumentInfo: method('getDocumentInfo'),
		getRelations: method('getRelations'),
		getParsePattern: method('getParsePattern'),
		getCollocations: method('getCollocations'),
		getHits: method('getHits'),
		getHitsCsv: method('getHitsCsv'),
		getDocsCsv: method('getDocsCsv'),
		getDocs: method('getDocs'),
		getSnippet: method('getSnippet'),
		getTermFrequencies: method('getTermFrequencies'),
		getTermAutocomplete: method('getTermAutocomplete'),
		getMetadataAutocomplete: method('getMetadataAutocomplete'),
	};
}

export function createMockFrontendApi(returnValues: MockApiReturnValues<FrontendApi> = {}): MockApi<FrontendApi> {
	const method = mockMethods<FrontendApi>('frontend', returnValues);
	return {
		getConfig: method('getConfig'),
		getDocumentContents: method('getDocumentContents'),
		getDocumentMetadata: method('getDocumentMetadata'),
		getHelp: method('getHelp'),
		getAbout: method('getAbout'),
		getTagset: method('getTagset'),
	};
}

export function createMockApi(options: MockApiOptions = {}) {
	const parts = {
		blacklabApi: createMockBlackLabApi(options.blacklab),
		frontendApi: createMockFrontendApi(options.frontend),
	};
	return { ...createApiPlugin(parts), ...parts };
}

export { resolvedRequest };
