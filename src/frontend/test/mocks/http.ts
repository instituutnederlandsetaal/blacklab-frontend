import type { AxiosAdapter, AxiosRequestConfig, AxiosResponse } from 'axios';

type HttpRequest = {
	config: AxiosRequestConfig;
	query: URLSearchParams;
	readonly cancelled: boolean;
	respond(data: unknown, status?: number, statusText?: string): void;
};

/** Per-client transport fixture; the real Axios interceptors and API response handling still run. */
export function createMockHttp() {
	const requests: HttpRequest[] = [];
	const unread: HttpRequest[] = [];
	const waiting: Array<(request: HttpRequest) => void> = [];
	const adapter: AxiosAdapter = config =>
		new Promise((resolve, reject) => {
			const request: HttpRequest = {
				config,
				query: new URLSearchParams(config.paramsSerializer?.(config.params) ?? config.params),
				get cancelled() {
					return !!config.cancelToken?.reason;
				},
				respond(data, status = 200, statusText = 'OK') {
					const response: AxiosResponse = { config, data, status, statusText, headers: {} };
					if (!config.validateStatus || config.validateStatus(status)) resolve(response);
					else reject(Object.assign(new Error(`Request failed with status code ${status}`), { config, response, isAxiosError: true }));
				},
			};
			void config.cancelToken?.promise.then(reject);
			requests.push(request);
			const next = waiting.shift();
			if (next) next(request);
			else unread.push(request);
		});
	return {
		adapter,
		requests,
		nextRequest(): Promise<HttpRequest> {
			const request = unread.shift();
			return request ? Promise.resolve(request) : new Promise(resolve => waiting.push(resolve));
		},
	};
}
