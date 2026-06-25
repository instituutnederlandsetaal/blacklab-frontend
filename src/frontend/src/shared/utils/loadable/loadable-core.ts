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
	map<U>(mapper: (value: T) => U): Loadable<U>;
	mapOptional<U>(mapper: (value: T | undefined) => U): Loadable<U>;
	mapError(mapper: (error: ApiError) => ApiError): Loadable<T>;
	recover(mapper: (error: ApiError) => T): Loadable<T>;
	flatMap<U>(mapper: (value: T) => Loadable<U>): Loadable<U>;
	flatMapOptional<U>(mapper: (value: T | undefined) => Loadable<U>): Loadable<U>;
	flatMapError<U>(mapper: (error: ApiError) => Loadable<U>): Loadable<T | U>;
	or(mapper: () => T | null | undefined): Loadable<T>;
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

export const isLoadableBase = <T>(v: any): v is LoadableBase<T> => v != null && typeof v === 'object' && Object.keys(loadableMethods).every(name => typeof v[name] === 'function');

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

export type LoadableStateValue<T, S extends LoadableState> = S extends LoadableState.loaded ? T : S extends LoadableState.error ? ApiError : undefined;

export function getLoadableStateValue<T, S extends LoadableState>(loadable: LoadableLike<T>, state: S): LoadableStateValue<T, S> {
	if (state === LoadableState.loaded) return loadable.value as LoadableStateValue<T, S>;
	if (state === LoadableState.error) return loadable.error as LoadableStateValue<T, S>;
	return undefined as LoadableStateValue<T, S>;
}

const passthrough = <T, U = T>(v: LoadableLike<T>): LoadableLike<U> => v as unknown as LoadableLike<U>;

export function map<T, U>(v: Loadable<T>, mapper: (value: T) => U): Loadable<U>;
export function map<T, U>(v: LoadableLike<T>, mapper: (value: T) => U): LoadableLike<U>;
export function map<T, U>(v: LoadableLike<T>, mapper: (value: T) => U): LoadableLike<U> {
	if (isLoaded(v)) return Loaded(mapper(v.value));
	return passthrough<T, U>(v);
}

export function mapOptional<T, U>(v: Loadable<T>, mapper: (value: T | undefined) => U): Loadable<U>;
export function mapOptional<T, U>(v: LoadableLike<T>, mapper: (value: T | undefined) => U): LoadableLike<U>;
export function mapOptional<T, U>(v: LoadableLike<T>, mapper: (value: T | undefined) => U): LoadableLike<U> {
	if (isLoaded(v)) return Loaded(mapper(v.value));
	if (isEmpty(v)) return Loaded(mapper(undefined));
	return passthrough<T, U>(v);
}

export function mapError<T>(v: Loadable<T>, mapper: (error: ApiError) => ApiError): Loadable<T>;
export function mapError<T>(v: LoadableLike<T>, mapper: (error: ApiError) => ApiError): LoadableLike<T>;
export function mapError<T>(v: LoadableLike<T>, mapper: (error: ApiError) => ApiError): LoadableLike<T> {
	return isError(v) ? LoadingError(mapper(v.error)) : passthrough(v);
}

export function recover<T>(v: Loadable<T>, mapper: (error: ApiError) => T): Loadable<T>;
export function recover<T>(v: LoadableLike<T>, mapper: (error: ApiError) => T): LoadableLike<T>;
export function recover<T>(v: LoadableLike<T>, mapper: (error: ApiError) => T): LoadableLike<T> {
	return isError(v) ? Loaded(mapper(v.error)) : passthrough(v);
}

export function flatMap<T, U>(v: Loadable<T>, mapper: (value: T) => Loadable<U>): Loadable<U>;
export function flatMap<T, U>(v: LoadableLike<T>, mapper: (value: T) => Loadable<U>): LoadableLike<U>;
export function flatMap<T, U>(v: LoadableLike<T>, mapper: (value: T) => Loadable<U>): LoadableLike<U> {
	if (isLoaded(v)) return mapper(v.value);
	return passthrough<T, U>(v);
}

export function flatMapOptional<T, U>(v: Loadable<T>, mapper: (value: T | undefined) => Loadable<U>): Loadable<U>;
export function flatMapOptional<T, U>(v: LoadableLike<T>, mapper: (value: T | undefined) => Loadable<U>): LoadableLike<U>;
export function flatMapOptional<T, U>(v: LoadableLike<T>, mapper: (value: T | undefined) => Loadable<U>): LoadableLike<U> {
	if (isLoaded(v)) return mapper(v.value);
	if (isEmpty(v)) return mapper(undefined);
	return passthrough<T, U>(v);
}

export function flatMapError<T, U>(v: Loadable<T>, mapper: (error: ApiError) => Loadable<U>): Loadable<T | U>;
export function flatMapError<T, U>(v: LoadableLike<T>, mapper: (error: ApiError) => Loadable<U>): LoadableLike<T | U>;
export function flatMapError<T, U>(v: LoadableLike<T>, mapper: (error: ApiError) => Loadable<U>): LoadableLike<T | U> {
	return isError(v) ? mapper(v.error) : passthrough(v);
}

export function or<T>(v: Loadable<T>, mapper: () => T | null | undefined): Loadable<T>;
export function or<T>(v: LoadableLike<T>, mapper: () => T | null | undefined): LoadableLike<T>;
export function or<T>(v: LoadableLike<T>, mapper: () => T | null | undefined): LoadableLike<T> {
	if (!isEmpty(v)) return passthrough(v);
	const value = mapper();
	return value != null ? Loaded(value) : Empty<T>();
}

export function thisMap<T, U>(this: Loadable<T>, mapper: (value: T) => U): Loadable<U> {
	return map(this, mapper);
}

export function thisMapOptional<T, U>(this: Loadable<T>, mapper: (value: T | undefined) => U): Loadable<U> {
	return mapOptional(this, mapper);
}

export function thisMapError<T>(this: Loadable<T>, mapper: (error: ApiError) => ApiError): Loadable<T> {
	return mapError(this, mapper);
}

export function thisRecover<T>(this: Loadable<T>, mapper: (error: ApiError) => T): Loadable<T> {
	return recover(this, mapper);
}

export function thisFlatMap<T, U>(this: Loadable<T>, mapper: (value: T) => Loadable<U>): Loadable<U> {
	return flatMap(this, mapper);
}

export function thisFlatMapOptional<T, U>(this: Loadable<T>, mapper: (value: T | undefined) => Loadable<U>): Loadable<U> {
	return flatMapOptional(this, mapper);
}

export function thisFlatMapError<T, U>(this: Loadable<T>, mapper: (error: ApiError) => Loadable<U>): Loadable<T | U> {
	return flatMapError(this, mapper);
}

export function thisOr<T>(this: Loadable<T>, mapper: () => T | null | undefined): Loadable<T> {
	return or(this, mapper);
}

export const loadableMethods = {
	isLoading: thisIsLoading,
	isLoaded: thisIsLoaded,
	isError: thisIsError,
	isEmpty: thisIsEmpty,
	map: thisMap,
	mapOptional: thisMapOptional,
	mapError: thisMapError,
	recover: thisRecover,
	flatMap: thisFlatMap,
	flatMapOptional: thisFlatMapOptional,
	flatMapError: thisFlatMapError,
	or: thisOr,
} satisfies LoadableBase<any>;

export const withLoadableMethods = <T, E extends object>(object: E): E & LoadableBase<T> => Object.assign(object, loadableMethods) as E & LoadableBase<T>;

export const loadable = <T, E extends object = never>(state: LoadableState, value?: T, error?: ApiError, extra?: E): Loadable<T> & E =>
	withLoadableMethods<T, LoadableLike<T> & E>({
		...(extra as E),
		state,
		value,
		error,
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
	getLoadableStateValue,
	map,
	mapOptional,
	mapError,
	recover,
	flatMap,
	flatMapOptional,
	flatMapError,
	or,
	thisIsLoading,
	thisIsLoaded,
	thisIsError,
	thisIsEmpty,
	thisMap,
	thisMapOptional,
	thisMapError,
	thisRecover,
	thisFlatMap,
	thisFlatMapOptional,
	thisFlatMapError,
	thisOr,
	loadableMethods,
	withLoadableMethods,
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
