import axios, {AxiosResponse, AxiosRequestConfig, AxiosError, Canceler} from 'axios';

import {ApiError} from '@/types/apptypes';
import {isBLError} from '@/types/blacklabtypes';
import { Loadable, toObservable } from '@/utils/loadable-streams';
import { Observable } from 'rxjs';

const settings = {
	// use a builtin delay to simulate network latency (in ms)
	delay: 0,
	// whether to set withCredentials in axios settings
	// This will send cookies with requests, which is required for authentication
	// HOWEVER, it requires a very specific setup to work, either of the following must be true:
	// a) the server must not set the Access-Control-Allow-Origin header to '*'
	// b) the client and the server must use the same protocol + domain + port
	// Any other case will result in a CORS error, even when there are no cookies.
	// so it's best to turn this off during development.

	withCredentials: typeof WITH_CREDENTIALS !== 'undefined' ? WITH_CREDENTIALS : false,
};

// Simulate a delay on an AxiosResponse/Error by returning a
// Promise that will resolve after settings.delay ms
export function delayResponse<T>(r: AxiosResponse<T>): Promise<AxiosResponse<T>> {
	return new Promise((resolve, reject) => {
		setTimeout(() => resolve(r), settings.delay);
	});
}
export function delayError(e: AxiosError): Promise<AxiosResponse<never>> {
	return new Promise((resolve, reject) => {
		setTimeout(() => reject(e), settings.delay);
	});
}

/**
 * Maps network error and blacklab error to ApiError.
 * For use with axios. Always returns a rejected promise containing the error.
 */
export async function handleError(error: AxiosError): Promise<never> {
	if (axios.isCancel(error)) { // is a cancelled request, message containing details
		return Promise.reject(ApiError.CANCELLED);
	}

	const response = error.response;
	if (!response) {
		let url: string;
		try {
			url = new URL(error.config.url || '', new URL(error.config.baseURL || '').toString()).toString();
		} catch (e) {
			url = [error.config.baseURL || '', error.config.url].join('');
		}

		return Promise.reject(new ApiError(
			error.message,
			'Could not connect to server at ' + url,
			'Server Offline',
			undefined
		));
	}

	// Something else is going on, assume it's a blacklab-server error
	const contentType: string = (response.headers['content-type'] || '');
	if (isBLError(response.data)) {
		return Promise.reject(new ApiError(
			response.data.error.code,
			response.data.error.message + (response.data.error.stackTrace ? '\nStack Trace:\n' + response.data.error.stackTrace : ''),
			response.statusText,
			response.status
		));
	} else if (contentType.toLowerCase().includes('xml') && typeof response.data === 'string' && response.data.length) {
		try {
			const text = response.data;
			const xml = new DOMParser().parseFromString(text, 'application/xml');

			/* blacklab errors in xml format look like this:
			<error>
				<code>PATT_SYNTAX_ERROR</code>
				<message>Syntax error in CorpusQL pattern (JSON parse failed as well): Error parsing query: Encountered "<EOF>" at line 1, column 9. Was expecting one of: ":" ... ":" ... </message>
				<!-- sometimes there's a stack trace (if we're in the debug list, usually localhost ip) -->
				<stackTrace>...</stackTrace>
			</error>
			*/
			const code = xml.querySelector('code');
			const message = xml.querySelector('message');
			const stackTrace = xml.querySelector('stackTrace');

			if (code && message) {
				return Promise.reject(new ApiError(
					code.textContent!,
					message.textContent! + (stackTrace ? '\nStack Trace:\n' + stackTrace.textContent : ''),
					response.statusText,
					response.status
				));
			} else {
				return Promise.reject(new ApiError(
					`Server returned an error (${response.statusText}) at: ${response.config.url}`,
					xml.textContent || response.data, // return just the text of the xml document.
					response.statusText,
					response.status
				));
			}
		} catch (e) {
			// failed to parse xml but response indicated it was xml... Return the raw text instead.
			return Promise.reject(new ApiError(
				`Server returned an error (${response.statusText}) at: ${response.config.url}`,
				response.data, // just print the raw text we received
				response.statusText,
				response.status
			));
		}
	} else {
		return Promise.reject(new ApiError(
			`Server returned an unexpected error at: ${response.config.url}`,
			response.data,
			response.statusText,
			response.status
		));
	}
}

export class CancelableRequest<T> implements Promise<T> {
	public request: Promise<T>;
	public cancel: Canceler;
	constructor(request: Promise<T>, cancel: Canceler) {
		this.request = request;
		this.cancel = cancel;
	}

	get [Symbol.toStringTag]() { return 'CancelableRequest'; }

	public then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): CancelableRequest<TResult1 | TResult2> {
		return new CancelableRequest(this.request.then(onfulfilled, onrejected), this.cancel);
	}
	public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelableRequest<T | TResult> {
		return new CancelableRequest(this.request.catch(onrejected), this.cancel);
	}
	public finally(onfinally?: (() => void) | undefined | null): CancelableRequest<T> {
		return new CancelableRequest(this.request.finally(onfinally), this.cancel);
	}

	public static isCancelableRequest<T>(value: any): value is CancelableRequest<T> {
		return value instanceof CancelableRequest;
	}

	public toObservable(): Observable<Loadable<T>> {
		return toObservable(this);
	}
}

export function createEndpoint(options: AxiosRequestConfig) {
	const endpoint = axios.create({
		withCredentials: settings.withCredentials,
		...options
	});

	return {
		...endpoint,
		getCancelable<T>(url: string, queryParams?: Record<string, string|number|boolean|Record<string, any>>, config?: AxiosRequestConfig): CancelableRequest<T> {
			const source = axios.CancelToken.source();
			const request = endpoint.get<T>(url, {...config, params: queryParams, cancelToken: source.token})
			.then(delayResponse, delayError)
			.then(r => r.data, handleError);
			return new CancelableRequest(request, source.cancel);
		},
		get<T>(url: string, queryParams?: Record<string, string|number|boolean|Record<string, any>>, config?: AxiosRequestConfig): Promise<T> {
			return this.getCancelable<T>(url, queryParams, config).request;
		},
		postCancelable<T>(url: string, formData?: any, config?: AxiosRequestConfig): CancelableRequest<T> {
			const source = axios.CancelToken.source();
			const request = endpoint.post<T>(url, formData, {...config, cancelToken: source.token})
			.then(delayResponse, delayError)
			.then(r => r.data, handleError);
			return new CancelableRequest(request, source.cancel);
		},
		post<T>(url: string, formData?: any, config?: AxiosRequestConfig): Promise<T> {
			return this.postCancelable<T>(url, formData, config).request;
		},
		// Server has issues with long urls in GET requests, so use POST instead when the query string is too long.
		// (only works with BlackLab currently)
		getOrPostCancelable<T>(url: string, queryParameters?: any, settings?: AxiosRequestConfig): CancelableRequest<T> {
			const queryString = queryParameters ? new URLSearchParams(queryParameters).toString() : '';
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
			const request = endpoint.request<T>({...config,method: 'DELETE',url, cancelToken: source.token})
			.then(delayResponse, delayError)
			.then(r => r.data, handleError);
			return new CancelableRequest(request, source.cancel);
		},
		delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
			return this.deleteCancelable<T>(url, config).request;
		},
	};
}
