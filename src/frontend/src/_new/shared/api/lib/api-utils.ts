import type { AxiosError } from 'axios';
import axios from 'axios';

import { ApiError } from '@/types/apptypes';
import { isBLError } from '@/types/blacklabtypes';
import { CancelableRequest } from '@/utils/loadable-streams';
import { isObject } from '@vueuse/core';

export function cleanQueryParams(params: any): any {
	if (isObject(params)) return Object.fromEntries(Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, cleanQueryParams(v)]));
	if (params instanceof URLSearchParams) {
		const cleaned = new URLSearchParams();
		for (const [k, v] of params.entries()) {
			if (v != null) {
				cleaned.append(k, v);
			}
		}
		return cleaned;
	}
	if (Array.isArray(params)) return params.filter(v => v != null).map(cleanQueryParams);
	return params;
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
		} catch {
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
	} else if (contentType.match(/xml/i) && typeof response.data === 'string' && response.data.length) {
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
		} catch {
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



export function rejectedRequest<T>(error: ApiError): CancelableRequest<T> {
	return new CancelableRequest(Promise.reject(error), () => {});
}

export function combineRequests<T>(requests: Array<CancelableRequest<unknown>>, request: Promise<T>): CancelableRequest<T> {
	return new CancelableRequest(request, () => requests.forEach(request => request.cancel()));
}