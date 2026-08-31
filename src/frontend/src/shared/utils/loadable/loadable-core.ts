import type { ObservableInput, ObservedValueOf } from 'rxjs';

import type { ApiError } from '@/shared/api/lib/api-types';

export enum LoadableState {
	loading,
	loaded,
	error,
	empty,
}

export interface LoadableBase<T> {
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

// Allow plain objects with the right shape to be considered loadables for convenience.
export const isLoadable = <T>(v: any): v is Loadable<T> => v != null && typeof v === 'object' && Object.keys(loadableMethods).every(name => typeof v[name] === 'function') && isLoadableLike<T>(v);

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

function thisIsLoading(this: LoadableLike<any>): this is LoadingLike<any>;
function thisIsLoading(this: Loadable<any>): this is Loading<any>;
function thisIsLoading(this: any): boolean {
	return isLoading(this);
}

function thisIsLoaded(this: LoadableLike<any>): this is LoadedLike<any>;
function thisIsLoaded(this: Loadable<any>): this is Loaded<any>;
function thisIsLoaded(this: any): boolean {
	return isLoaded(this);
}

function thisIsError(this: LoadableLike<any>): this is LoadingErrorLike<any>;
function thisIsError(this: Loadable<any>): this is LoadingError<any>;
function thisIsError(this: any): boolean {
	return isError(this);
}

function thisIsEmpty(this: LoadableLike<any>): this is EmptyLike<any>;
function thisIsEmpty(this: Loadable<any>): this is Empty<any>;
function thisIsEmpty(this: any): boolean {
	return isEmpty(this);
}

function map<T, U>(v: Loadable<T>, mapper: (value: T) => U): Loadable<U>;
function map<T, U>(v: LoadableLike<T>, mapper: (value: T) => U): LoadableLike<U>;
/** Map Loaded values and preserve every other state by identity. */
function map<T, U>(v: LoadableLike<T>, mapper: (value: T) => U): LoadableLike<U> {
	if (isLoaded(v)) return Loaded(mapper(v.value));
	return v as unknown as LoadableLike<U>;
}

const loadableMethods = {
	isLoading: thisIsLoading,
	isLoaded: thisIsLoaded,
	isError: thisIsError,
	isEmpty: thisIsEmpty,
} satisfies LoadableBase<any>;

/** Attach the loadable state checks to a state object. */
export const withLoadableMethods = <T, E extends object>(object: E): E & LoadableBase<T> => Object.assign(object, loadableMethods) as E & LoadableBase<T>;

const loadable = <T, E extends object = never>(state: LoadableState, value?: T, error?: ApiError, extra?: E): Loadable<T> & E =>
	withLoadableMethods<T, LoadableLike<T> & E>({
		...(extra as E),
		state,
		value,
		error,
	});

/** Normalize a loadable, loadable-like object, plain value, or empty value. */
const wrap = <T, VT extends ValueTypeFromLoadableOrObservable<T> = ValueTypeFromLoadableOrObservable<T>>(value: T): Loadable<VT> =>
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
	map,
	thisIsLoading,
	thisIsLoaded,
	thisIsError,
	thisIsEmpty,
	loadableMethods,
	withLoadableMethods,
};

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

export type ValueTypeFromLoadableOrObservable<T> = Val<T extends ArrayLike<any> ? T : T extends ObservableInput<any> ? ObservedValueOf<T> : T>;
