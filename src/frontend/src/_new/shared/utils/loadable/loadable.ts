import type { ObservableInput, ObservedValueOf } from 'rxjs';

import type { ApiError } from '@/_new/shared/api/lib/api-types';

export enum LoadableState {
	loading,
	loaded,
	error,
	empty,
}

interface LoadableBase<T> {
	isLoading(): this is Loading<T>;
	isLoaded(): this is Loaded<T>;
	isError(): this is LoadingError<T>;
	isEmpty(): this is Empty<T>;
}

export interface LoadingLike<T> extends LoadableLike<T> {
	state: LoadableState.loading;
	value: undefined;
	error: undefined;
}
export interface Loading<T> extends LoadingLike<T>, LoadableBase<T> {}

interface EmptyLike<T> extends LoadableLike<T> {
	state: LoadableState.empty;
	value: undefined;
	error: undefined;
}
export interface Empty<T> extends EmptyLike<T>, LoadableBase<T> {}

interface LoadedLike<T> extends LoadableLike<T> {
	state: LoadableState.loaded;
	value: T;
	error: undefined;
}
export interface Loaded<T> extends LoadedLike<T>, LoadableBase<T> {}

interface LoadingErrorLike<T> extends LoadableLike<T> {
	state: LoadableState.error;
	value: undefined;
	error: ApiError;
}
export interface LoadingError<T> extends LoadingErrorLike<T>, LoadableBase<T> {}

export interface LoadableLike<T> {
	state: LoadableState;
	value: T | undefined;
	error: ApiError | undefined;
}

export interface Loadable<T> extends LoadableLike<T>, LoadableBase<T> {}

export const isLoadableLike = <T>(v: any): v is LoadableLike<T> => v != null && typeof v === 'object' && 'state' in v && v.state in LoadableState && 'value' in v && 'error' in v;

export const isLoadableBase = <T>(v: any): v is LoadableBase<T> => v != null && typeof v === 'object' && 'isLoading' in v && 'isLoaded' in v && 'isError' in v && 'isEmpty' in v;

// Allow plain objects with the right shape to be considered loadables for convenience.
export const isLoadable = <T>(v: any): v is Loadable<T> => isLoadableBase<T>(v) && isLoadableLike<T>(v);

export function isLoading<T>(v: Loadable<T>): v is Loading<T>;
export function isLoading<T>(v: LoadableLike<T>): v is LoadingLike<T>;
export function isLoading<T>(v: unknown): boolean {
	return isLoadableLike<T>(v) && v.state === LoadableState.loading;
}

export function isLoaded<T>(v: Loadable<T>): v is Loaded<T>;
export function isLoaded<T>(v: LoadableLike<T>): v is LoadedLike<T>;
export function isLoaded<T>(v: unknown): boolean {
	return isLoadableLike<T>(v) && v.state === LoadableState.loaded;
}

export function isError<T>(v: Loadable<T>): v is LoadingError<T>;
export function isError<T>(v: LoadableLike<T>): v is LoadingErrorLike<T>;
export function isError<T>(v: unknown): boolean {
	return isLoadableLike<T>(v) && v.state === LoadableState.error;
}

export function isEmpty<T>(v: Loadable<T>): v is Empty<T>;
export function isEmpty<T>(v: LoadableLike<T>): v is EmptyLike<T>;
export function isEmpty<T>(v: unknown): boolean {
	return isLoadableLike<T>(v) && v.state === LoadableState.empty;
}

export function thisIsLoading(this: LoadableLike<any>): this is LoadingLike<any>;
export function thisIsLoading(this: Loadable<any>): this is Loading<any>;
export function thisIsLoading(this: any): boolean {
	return isLoading(this);
}

export function thisIsLoaded(this: LoadableLike<any>): this is LoadedLike<any>;
export function thisIsLoaded(this: Loadable<any>): this is Loaded<any>;
export function thisIsLoaded(this: any): boolean {
	return isLoaded(this);
}

export function thisIsError(this: LoadableLike<any>): this is LoadingErrorLike<any>;
export function thisIsError(this: Loadable<any>): this is LoadingError<any>;
export function thisIsError(this: any): boolean {
	return isError(this);
}

export function thisIsEmpty(this: LoadableLike<any>): this is EmptyLike<any>;
export function thisIsEmpty(this: Loadable<any>): this is Empty<any>;
export function thisIsEmpty(this: any): boolean {
	return isEmpty(this);
}

export const loadable = <T, E extends object = never>(state: LoadableState, value?: T, error?: ApiError, extra?: E): Loadable<T> & E => ({
	...(extra as any),
	state,
	value,
	error,
	isLoading: thisIsLoading,
	isLoaded: thisIsLoaded,
	isError: thisIsError,
	isEmpty: thisIsEmpty,
});

export const wrap = <T, VT extends ValueTypeFromLoadableOrObservable<T> = ValueTypeFromLoadableOrObservable<T>>(value: T): Loadable<VT> =>
	isLoadable(value) ? (value as Loadable<VT>) : isLoadableLike<VT>(value) ? loadable<VT>(value.state, value.value, value.error) : value != null ? Loaded<VT>(value as VT) : Empty<VT>();

export const Loading = <T = never>(): Loading<T> => loadable<T>(LoadableState.loading, undefined, undefined) as Loading<T>;

export const Loaded = <T>(value: T): Loaded<T> => loadable<T>(LoadableState.loaded, value, undefined) as Loaded<T>;

export const LoadingError = <T = never>(error: ApiError): LoadingError<T> => loadable<T>(LoadableState.error, undefined, error) as LoadingError<T>;

export const Empty = <T = never>(): Empty<T> => loadable<T>(LoadableState.empty, undefined, undefined) as Empty<T>;

export const Loadable = {
	loadable,
	Loading,
	Loaded,
	LoadingError,
	Empty,
	isLoadable,
	isLoading,
	isLoaded,
	isError,
	isEmpty,
	wrap,
};

export type Replace<T extends Loadable<any>, U> =
	T extends Loaded<any>
		? Loaded<U>
		: T extends LoadingError<any>
			? LoadingError<U>
			: T extends Loading<any>
				? Loading<U>
				: T extends Empty<any>
					? Empty<U>
					: T extends Loadable<any>
						? Loadable<U>
						: never;

export type Val<T> = T extends Loaded<infer LT> ? LT : T extends Loading<infer LT> ? LT : T extends Empty<any> ? never : T extends LoadingError<any> ? never : T extends Loadable<infer LT> ? LT : T;

export type ValEmpty<T> =
	T extends Loaded<infer LT>
		? LT
		: T extends Loading<infer LT>
			? LT
			: T extends Empty<unknown>
				? undefined
				: T extends LoadingError<unknown>
					? never
					: T extends Loadable<infer LT>
						? LT | undefined
						: T;

export type ValError<T> =
	T extends Loaded<infer LT> ? LT : T extends Loading<infer LT> ? LT : T extends Empty<unknown> ? never : T extends LoadingError<unknown> ? ApiError : T extends Loadable<infer LT> ? LT | ApiError : T;

export type ValEmptyAndError<T> =
	T extends Loaded<infer LT>
		? LT
		: T extends Loading<infer LT>
			? LT
			: T extends Empty<unknown>
				? undefined
				: T extends LoadingError<unknown>
					? ApiError
					: T extends Loadable<infer LT>
						? LT | undefined | ApiError
						: T;

export type ValueTypeFromLoadableOrObservable<T> = Val<T extends ArrayLike<any> ? T : T extends ObservableInput<any> ? ObservedValueOf<T> : T>;
