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

export interface Loadable<T> extends LoadableBase<T> {
	state: LoadableState;
	value: T | undefined;
	error: ApiError | undefined;
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

function thisIsLoading(this: Loadable<any>): this is Loading<any>;
function thisIsLoading(this: any): boolean {
	return isLoading(this);
}

function thisIsLoaded(this: Loadable<any>): this is Loaded<any>;
function thisIsLoaded(this: any): boolean {
	return isLoaded(this);
}

function thisIsError(this: Loadable<any>): this is LoadingError<any>;
function thisIsError(this: any): boolean {
	return isError(this);
}

function thisIsEmpty(this: Loadable<any>): this is Empty<any>;
function thisIsEmpty(this: any): boolean {
	return isEmpty(this);
}

function map<T, U>(v: Loadable<T>, mapper: (value: T) => U): Loadable<U>;
/** Map Loaded values and preserve every other state by identity. */
function map<T, U>(v: Loadable<T>, mapper: (value: T) => U): Loadable<U> {
	if (isLoaded(v)) return Loaded(mapper(v.value));
	return v as unknown as Loadable<U>;
}

const loadableMethods = {
	isLoading: thisIsLoading,
	isLoaded: thisIsLoaded,
	isError: thisIsError,
	isEmpty: thisIsEmpty,
} satisfies LoadableBase<any>;

/** Attach the loadable state checks to a state object. */
export const withLoadableMethods = <T, E extends object>(object: E): E & LoadableBase<T> => Object.assign(object, loadableMethods) as E & LoadableBase<T>;

const loadable = <T, E extends object = {}>(state: LoadableState, value?: T, error?: ApiError, extra?: E): Loadable<T> & E =>
	withLoadableMethods<T, Omit<Loadable<T>, keyof LoadableBase<T>> & E>({
		...(extra as E),
		state,
		value,
		error,
	});

/** Normalize a loadable, plain value, or empty value. */
const wrap = <T, VT extends ValueTypeFromLoadableOrObservable<T> = ValueTypeFromLoadableOrObservable<T>>(value: T): Loadable<VT> =>
	isLoadable(value) ? (value as Loadable<VT>) : value != null ? Loaded<VT>(value as VT) : Empty<VT>();

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
