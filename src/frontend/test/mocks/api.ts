import { ApiError, type BlackLabApi, type BlackLabPaths, type CancelableRequest, type FrontendApi } from '@/shared/api/lib/api-types';
import { rejectedRequest as rejectedApiRequest, resolvedRequest } from '@/shared/api/lib/api-utils';
import { createApiPlugin, type ApiPlugin, type ApiPluginParts } from '@/shared/api/plugin';

type MockApiValue<TMethod> = TMethod extends (...args: infer Args) => CancelableRequest<infer Value> ? Value | ((...args: Args) => CancelableRequest<Value>) : never;

export type MockApiReturnValues<TApi> = Partial<{
	[Method in keyof TApi]: MockApiValue<TApi[Method]>;
}>;

export type MockApiOptions = {
	blacklab?: MockApiReturnValues<BlackLabApi>;
	frontend?: MockApiReturnValues<FrontendApi>;
	blacklabPaths?: Partial<BlackLabPaths>;
};

const hasOwn = <T extends object>(object: T, key: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(object, key);

function unconfiguredMockApiError(methodName: string): ApiError {
	return new ApiError('Mock API method not configured', `Mock API method "${methodName}" was called without a configured return value.`, 'Mock API', undefined);
}

export function rejectedRequest<T>(error: string | ApiError): CancelableRequest<T> {
	const apiError = typeof error === 'string' ? new ApiError('Mock API error', error, 'Mock API', undefined) : error;
	return rejectedApiRequest(apiError);
}

function createMockApiProxy<TApi extends object>(apiName: string, returnValues: MockApiReturnValues<TApi> = {}): TApi {
	return new Proxy(
		{},
		{
			get: (_target, property) => {
				if (typeof property === 'symbol') return undefined;
				return (...args: any[]) => {
					if (hasOwn(returnValues, property)) {
						const value = returnValues[property as keyof TApi] as any;
						return typeof value === 'function' ? value(...args) : resolvedRequest(value);
					}

					const methodName = `${apiName}.${property}`;
					console.warn(`Mock API method "${methodName}" was called without a configured return value.`);
					return rejectedRequest(unconfiguredMockApiError(methodName));
				};
			},
		},
	) as TApi;
}

export function createMockBlackLabApi(returnValues: MockApiReturnValues<BlackLabApi> = {}): BlackLabApi {
	return createMockApiProxy<BlackLabApi>('blacklab', returnValues);
}

export function createMockFrontendApi(returnValues: MockApiReturnValues<FrontendApi> = {}): FrontendApi {
	return createMockApiProxy<FrontendApi>('frontend', returnValues);
}

function createMockBlackLabPaths(overrides: Partial<BlackLabPaths> = {}): BlackLabPaths {
	return new Proxy(overrides, {
		get: (target, property) => {
			if (typeof property === 'symbol') return undefined;
			return property in target ? target[property as keyof BlackLabPaths] : (...parts: unknown[]) => [property, ...parts.map(String)].join('/');
		},
	}) as BlackLabPaths;
}

function createMockApiParts(options: MockApiOptions = {}): ApiPluginParts {
	return {
		blacklabApi: createMockBlackLabApi(options.blacklab),
		frontendApi: createMockFrontendApi(options.frontend),
		blacklabPaths: createMockBlackLabPaths(options.blacklabPaths),
	};
}

export function createMockApi(options: MockApiOptions = {}): ApiPlugin {
	return createApiPlugin(createMockApiParts(options));
}

export { resolvedRequest };
