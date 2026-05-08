import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { User } from 'oidc-client-ts';
import { toValue, type MaybeRef } from 'vue';

import { CancelableRequest } from '@/_new/shared/api/lib/api-types';
import { cleanQueryParams, handleError } from '@/_new/shared/api/lib/api-utils';

export type Endpoint = Omit<AxiosInstance, 'get' | 'post' | 'delete'> & {
	getCancelable<T>(url: string, queryParams?: Record<string, string | number | boolean | Record<string, any>>, config?: AxiosRequestConfig): CancelableRequest<T>;
	get<T>(url: string, queryParams?: Record<string, string | number | boolean | Record<string, any>>, config?: AxiosRequestConfig): Promise<T>;

	postCancelable<T>(url: string, formData?: any, config?: AxiosRequestConfig): CancelableRequest<T>;
	post<T>(url: string, formData?: any, config?: AxiosRequestConfig): Promise<T>;

	getOrPostCancelable<T>(url: string, queryParameters?: any, settings?: AxiosRequestConfig): CancelableRequest<T>;
	getOrPost<T>(url: string, queryParameters?: any, settings?: AxiosRequestConfig): Promise<T>;

	deleteCancelable<T>(url: string, config?: AxiosRequestConfig): CancelableRequest<T>;
	delete<T>(url: string, config?: AxiosRequestConfig): Promise<T>;
};

export type EndpointSettings = {
	baseUrl: string;
	user: MaybeRef<User | null>;
	headers?: Record<string, string>;
	axiosOptions?: Omit<AxiosRequestConfig, 'baseURL' | 'headers'>;
};

export function createEndpoint(p: EndpointSettings): Endpoint {
	const endpoint = axios.create({
		...p.axiosOptions,
		baseURL: p.baseUrl.replace(/\/*$/, '/'),
		headers: p.headers,
		paramsSerializer: params => new URLSearchParams(cleanQueryParams(params)).toString(),
		// whether to set withCredentials in axios settings
		// This will send cookies with requests, which is required for authentication
		// HOWEVER, it requires a very specific setup to work, either of the following must be true:
		// a) the server must not set the Access-Control-Allow-Origin header to '*'
		// b) the client and the server must use the same protocol + domain + port
		// Any other case will result in a CORS error, even when there are no cookies.
		// so it's best to turn this off during development.
		withCredentials: WITH_CREDENTIALS ?? false,
	});

	endpoint.interceptors.request.use(config => {
		const user = toValue(p.user);
		if (user && user.access_token) config.headers = Object.assign(config.headers ?? {}, { Authorization: `Bearer ${user.access_token}` });
		return config;
	});

	return {
		...endpoint,
		getCancelable<T>(url: string, queryParams?: Record<string, string | number | boolean | Record<string, any>>, config?: AxiosRequestConfig): CancelableRequest<T> {
			const source = axios.CancelToken.source();
			const request = endpoint.get<T>(url, { ...config, params: cleanQueryParams(queryParams), cancelToken: source.token }).then(r => r.data, handleError);
			return new CancelableRequest(request, source.cancel);
		},
		get<T>(url: string, queryParams?: Record<string, string | number | boolean | Record<string, any>>, config?: AxiosRequestConfig): Promise<T> {
			return this.getCancelable<T>(url, queryParams, config).request;
		},
		postCancelable<T>(url: string, formData?: any, config?: AxiosRequestConfig): CancelableRequest<T> {
			const source = axios.CancelToken.source();
			const request = endpoint.post<T>(url, cleanQueryParams(formData), { ...config, cancelToken: source.token }).then(r => r.data, handleError);
			return new CancelableRequest(request, source.cancel);
		},
		post<T>(url: string, formData?: any, config?: AxiosRequestConfig): Promise<T> {
			return this.postCancelable<T>(url, formData, config).request;
		},
		// Server has issues with long urls in GET requests, so use POST instead when the query string is too long.
		// (only works with BlackLab currently)
		getOrPostCancelable<T>(url: string, queryParameters?: any, settings?: AxiosRequestConfig): CancelableRequest<T> {
			const queryString = queryParameters ? new URLSearchParams(cleanQueryParams(queryParameters)).toString() : '';
			const usePost = queryString.length > 1000;
			if (usePost) {
				settings = settings || {};
				settings.headers = settings.headers || {};
				settings.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';

				// override the default-set outputformat if another is provided.
				// Or it will be sent in both the request body and the query string causing unpredictable behavior in what is actually returned.
				if (queryParameters.outputformat) {
					settings.params = settings.params || {};
					settings.params.outputformat = queryParameters.outputformat;
				}

				return this.postCancelable<T>(url, queryString, settings);
			} else {
				return this.getCancelable<T>(url, queryParameters, settings);
			}
		},
		getOrPost<T>(url: string, queryParameters?: any, settings?: AxiosRequestConfig): Promise<T> {
			return this.getOrPostCancelable<T>(url, queryParameters, settings).request;
		},
		deleteCancelable<T>(url: string, config?: AxiosRequestConfig): CancelableRequest<T> {
			const source = axios.CancelToken.source();
			// Need to use the generic .request function because .delete
			// returns a void promise by design, yet blacklab sends response bodies
			const request = endpoint.request<T>({ ...config, method: 'DELETE', url, cancelToken: source.token }).then(r => r.data, handleError);
			return new CancelableRequest(request, source.cancel);
		},
		delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
			return this.deleteCancelable<T>(url, config).request;
		},
	};
}
