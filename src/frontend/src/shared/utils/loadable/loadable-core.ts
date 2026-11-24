import type { ApiError } from '@/shared/api/lib/api-types';

export enum LoadableState {
	loading,
	loaded,
	error,
	empty,
}

export interface Loadable<T> {
	state: LoadableState;
	value: T | undefined;
	error: ApiError | undefined;

	isLoading(): this is Loading<T>;
	isLoaded(): this is Loaded<T>;
	isError(): this is LoadingError<T>;
	isEmpty(): this is Empty<T>;
}

export interface Loading<T> extends Loadable<T> {
	state: LoadableState.loading;
	value: undefined;
	error: undefined;
}

export interface Empty<T> extends Loadable<T> {
	state: LoadableState.empty;
	value: undefined;
	error: undefined;
}

export interface Loaded<T> extends Loadable<T> {
	state: LoadableState.loaded;
	value: T;
	error: undefined;
}

export interface LoadingError<T> extends Loadable<T> {
	state: LoadableState.error;
	value: undefined;
	error: ApiError;
}

export const isLoadable = <T>(v: any): v is Loadable<T> =>
	v != null && typeof v === 'object' && 'state' in v && v.state in LoadableState && 'value' in v && 'error' in v && Object.keys(loadableMethods).every(name => typeof v[name] === 'function');

export function isLoading<T>(v: Loadable<T>): v is Loading<T>;
export function isLoading<T>(v: unknown): boolean {
	return isLoadable<T>(v) && v.state === LoadableState.loading;
}

export function isLoaded<T>(v: Loadable<T>): v is Loaded<T>;
export function isLoaded<T>(v: unknown): boolean {
	return isLoadable<T>(v) && v.state === LoadableState.loaded;
}

export function isError<T>(v: Loadable<T>): v is LoadingError<T>;
export function isError<T>(v: unknown): boolean {
	return isLoadable<T>(v) && v.state === LoadableState.error;
}

export function isEmpty<T>(v: Loadable<T>): v is Empty<T>;
export function isEmpty<T>(v: unknown): boolean {
	return isLoadable<T>(v) && v.state === LoadableState.empty;
}

/** Map Loaded values and preserve every other state by identity. */
function map<T, U>(v: Loadable<T>, mapper: (value: T) => U): Loadable<U> {
	if (isLoaded(v)) return Loaded(mapper(v.value));
	return v as unknown as Loadable<U>;
}

export const loadableMethods = {
	isLoading<T>(this: Loadable<T>): this is Loading<T> {
		return isLoading(this);
	},
	isLoaded<T>(this: Loadable<T>): this is Loaded<T> {
		return isLoaded(this);
	},
	isError<T>(this: Loadable<T>): this is LoadingError<T> {
		return isError(this);
	},
	isEmpty<T>(this: Loadable<T>): this is Empty<T> {
		return isEmpty(this);
	},
};

/** Normalize a loadable, plain value, or empty value. */
function wrap<T>(value: T | Loadable<T>): Loadable<T> {
	return isLoadable<T>(value) ? value : value == null ? Empty<T>() : Loaded(value);
}

export const Loading = <T = never>(): Loading<T> => ({ state: LoadableState.loading, value: undefined, error: undefined, ...loadableMethods });

export const Loaded = <T>(value: T): Loaded<T> => ({ state: LoadableState.loaded, value, error: undefined, ...loadableMethods });

export const LoadingError = <T = never>(error: ApiError): LoadingError<T> => ({ state: LoadableState.error, value: undefined, error, ...loadableMethods });

export const Empty = <T = never>(): Empty<T> => ({ state: LoadableState.empty, value: undefined, error: undefined, ...loadableMethods });

export const Loadable = {
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
	map,
};
