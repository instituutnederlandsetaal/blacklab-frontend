import type { Canceler } from 'axios';
import type { InteropObservable, Observable } from 'rxjs';

import type { Loadable } from '@/shared/utils/loadable/loadable';
import { toObservable } from '@/shared/utils/loadable/loadable-streams';

export class CancelableRequest<T> implements InteropObservable<Loadable<T>>, Promise<T> {
	public request: Promise<T>;
	public cancel: Canceler;
	constructor(request: Promise<T>, cancel: Canceler) {
		this.request = request;
		this.cancel = cancel;
	}

	get [Symbol.toStringTag]() {
		return 'CancelableRequest';
	}

	public then<TResult1 = T, TResult2 = never>(
		onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): CancelableRequest<TResult1 | TResult2> {
		return new CancelableRequest(this.request.then(onfulfilled, onrejected), this.cancel);
	}
	public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): CancelableRequest<T | TResult> {
		return new CancelableRequest(this.request.catch(onrejected), this.cancel);
	}
	public finally(onfinally?: (() => void) | null): CancelableRequest<T> {
		return new CancelableRequest(this.request.finally(onfinally), this.cancel);
	}

	public static isCancelableRequest<T>(value: any): value is CancelableRequest<T> {
		return value instanceof CancelableRequest;
	}

	public toObservable(): Observable<Loadable<T>> {
		return toObservable(this);
	}

	[Symbol.observable]() {
		return this.toObservable();
	}
}

export class ApiError extends Error {
	public readonly title: string;
	public readonly message: string;
	/** Message representing the httpCode, like "Not Found" for 404 */
	public readonly statusText: string;
	/** Http code, -1 if generic network error, http code otherwise, or none if no network error at all. */
	public readonly httpCode: number | undefined;

	public static CANCELLED = new ApiError('Request Cancelled', 'The request was cancelled by the user.', 'Cancelled', -1);

	constructor(title: string, message: string, statusText: string, httpCode: number | undefined) {
		super(message);
		this.title = title;
		this.message = message;
		this.statusText = statusText;
		this.httpCode = httpCode;
	}

	get isCancelledRequest() {
		return this === ApiError.CANCELLED;
	}

	public static wrap(error: any): ApiError {
		if (error instanceof ApiError) return error;
		if (error instanceof Error) return new ApiError('Unknown Error', `${error.message}`, 'Error', undefined);
		return new ApiError(error?.title ?? 'Unknown Error', error?.message ?? `${JSON.stringify(error)}`, error?.statusText ?? 'Error', error?.httpCode ?? undefined);
	}
}
