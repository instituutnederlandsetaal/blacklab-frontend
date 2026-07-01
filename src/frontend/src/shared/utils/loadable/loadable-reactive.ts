import { tryOnScopeDispose } from '@vueuse/core';
import { reactive, ref, shallowRef, toRef, unref, watchEffect, type MaybeRef, type Ref } from 'vue';

import type { MaybeLoadable } from './loadable-combine';
import {
	getLoadableStateValue,
	isEmpty,
	isLoaded,
	Loadable,
	LoadableState,
	withLoadableMethods,
	type Loadable as LoadableType,
	type LoadableBase,
	type LoadableLike,
	type LoadableStateValue,
} from './loadable-core';

import type { ApiError } from '@/shared/api/lib/api-types';

export type MaybeRefLoadable<T> = MaybeRef<MaybeLoadable<T>>;
export type ReactiveLoadableControls = { retry: () => void; stop: () => void };
export interface ReactiveLoadable<T> extends LoadableType<T> {
	map<U>(mapper: (value: T) => U): ControlledLoadable<U>;
	mapOptional<U>(mapper: (value: T | undefined) => U): ControlledLoadable<U>;
	mapError(mapper: (error: ApiError) => ApiError): ControlledLoadable<T>;
	recover(mapper: (error: ApiError) => T): ControlledLoadable<T>;
	flatMap<U>(mapper: (value: T) => MaybeRefLoadable<U>): ControlledLoadable<U>;
	flatMapOptional<U>(mapper: (value: T | undefined) => MaybeRefLoadable<U>): ControlledLoadable<U>;
	flatMapError<U>(mapper: (error: ApiError) => MaybeRefLoadable<U>): ControlledLoadable<T | U>;
	or(mapper: () => T | null | undefined): ControlledLoadable<T>;
}
export type ControlledLoadable<T> = ReactiveLoadable<T> & ReactiveLoadableControls;

/** @deprecated Import LoadableFromRequest from loadable-datasource when the value is request-backed. */
export type LoadableFromRequest<T> = ControlledLoadable<T>;

type WritableLoadableRefs<T> = {
	state: Ref<LoadableState>;
	value: Ref<T | undefined>;
	error: Ref<ApiError | undefined>;
};

type LoadableStateMapResult<T, U, S extends LoadableState> = S extends LoadableState.loaded ? U : U | T;

function isRetryableLoadable<T>(loadable: MaybeLoadable<T>): loadable is ControlledLoadable<T> {
	return typeof (loadable as Partial<ControlledLoadable<T>>).retry === 'function' && typeof (loadable as Partial<ControlledLoadable<T>>).stop === 'function';
}

function forEachUniqueRetryableLoadable(loadables: (MaybeLoadable<unknown> | undefined)[], callback: (loadable: ControlledLoadable<unknown>) => void) {
	const seen = new Set<MaybeLoadable<unknown>>();
	for (const loadable of loadables) {
		if (!loadable || seen.has(loadable)) continue;
		seen.add(loadable);
		if (isRetryableLoadable(loadable)) callback(loadable);
	}
}

function isSameLoadable(left: MaybeLoadable<unknown> | undefined, right: MaybeLoadable<unknown> | undefined) {
	return left === right;
}

function reuseLoadableValueIfUnchanged<T>(previousValue: T | undefined, nextValue: T | undefined): T | undefined {
	if (previousValue == null || nextValue == null) return nextValue;

	if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
		return previousValue.length === nextValue.length && previousValue.every((value, index) => Object.is(value, nextValue[index])) ? previousValue : nextValue;
	}

	if (typeof previousValue === 'object' && typeof nextValue === 'object') {
		const previousEntries = Object.entries(previousValue as Record<string, unknown>);
		const nextEntries = Object.entries(nextValue as Record<string, unknown>);
		return previousEntries.length === nextEntries.length && nextEntries.every(([key, value], index) => previousEntries[index]?.[0] === key && Object.is(previousEntries[index]?.[1], value))
			? previousValue
			: nextValue;
	}

	return nextValue;
}

function withReactiveLoadableMethods<T, E extends object>(object: E): E & ReactiveLoadable<T> {
	return Object.assign(withLoadableMethods<T, E>(object), reactiveLoadableMethods) as E & ReactiveLoadable<T>;
}

function reactiveLoadableFromRefs<T, E extends object>(refs: WritableLoadableRefs<T>, extra: E): ReactiveLoadable<T> & E {
	const r = reactive({
		...(extra as E),
		state: refs.state,
		value: refs.value,
		error: refs.error,
	});
	return withReactiveLoadableMethods<T, LoadableLike<T> & E>(r as LoadableLike<T> & E);
}

function applyLoadableToRefs<T>(refs: WritableLoadableRefs<T>, loadable: MaybeLoadable<T>, options: { reuseLoadedValue?: boolean } = {}) {
	const nextState = loadable.state;
	const nextValue = isLoaded(loadable) ? (options.reuseLoadedValue ? reuseLoadableValueIfUnchanged(refs.value.value, loadable.value) : loadable.value) : undefined;
	const nextError = nextState === LoadableState.error ? loadable.error : undefined;

	if (Object.is(refs.state.value, nextState) && Object.is(refs.value.value, nextValue) && Object.is(refs.error.value, nextError)) return;

	if (refs.state.value === nextState) {
		refs.value.value = nextValue;
		refs.error.value = nextError;
		return;
	}

	if (nextState === LoadableState.loaded) {
		refs.value.value = nextValue;
		refs.state.value = nextState;
		refs.error.value = undefined;
		return;
	}

	if (nextState === LoadableState.error) {
		refs.error.value = nextError;
		refs.state.value = nextState;
		refs.value.value = undefined;
		return;
	}

	refs.state.value = nextState;
	refs.value.value = undefined;
	refs.error.value = undefined;
}

export const loadableReactive = <T, E extends object = {}>(
	state: MaybeRef<LoadableState>,
	value?: MaybeRef<T | undefined>,
	error?: MaybeRef<ApiError | undefined>,
	extra?: E,
): ReactiveLoadable<T> & E => {
	return reactiveLoadableFromRefs<T, E>(
		{
			state: toRef(state) as Ref<LoadableState>,
			value: (value == null ? ref<T>() : toRef(value)) as Ref<T | undefined>,
			error: (error == null ? ref<ApiError>() : toRef(error)) as Ref<ApiError | undefined>,
		},
		extra as E,
	);
};

export const loadableFromRefs = loadableReactive;

export function createDerivedLoadable<T>(
	startWatching: (applyLoadable: (loadable: MaybeLoadable<T>) => void) => () => void,
	getRetryables: () => (MaybeLoadable<unknown> | undefined)[],
): ControlledLoadable<T> {
	const refs: WritableLoadableRefs<T> = {
		state: shallowRef(LoadableState.empty),
		value: shallowRef<T | undefined>(),
		error: shallowRef<ApiError | undefined>(),
	};
	const applyLoadable = (loadable: MaybeLoadable<T>) => applyLoadableToRefs(refs, loadable, { reuseLoadedValue: true });

	const stopWatching = startWatching(applyLoadable);

	const retry = () => {
		forEachUniqueRetryableLoadable(getRetryables(), loadable => loadable.retry());
	};

	const stop = () => {
		stopWatching();
		forEachUniqueRetryableLoadable(getRetryables(), loadable => loadable.stop());
	};

	tryOnScopeDispose(stop);

	return reactiveLoadableFromRefs<T, ReactiveLoadableControls>(refs, { retry, stop }) as ControlledLoadable<T>;
}

function flatMapSingleLoadableReactive<T, U, S extends LoadableState>(
	loadable: MaybeRefLoadable<T>,
	stateToMatch: S,
	mapper: (value: LoadableStateValue<T, S>) => MaybeRefLoadable<U>,
): ControlledLoadable<LoadableStateMapResult<T, U, S>> {
	let currentSource: MaybeLoadable<T> = Loadable.Empty<T>();
	let currentMapped: MaybeLoadable<U> | undefined;

	return createDerivedLoadable<LoadableStateMapResult<T, U, S>>(
		applyLoadable =>
			watchEffect(() => {
				const resolvedSource = unref(loadable) as MaybeLoadable<T>;
				currentSource = resolvedSource;

				if (resolvedSource.state !== stateToMatch) {
					if (currentMapped && !isSameLoadable(currentMapped, resolvedSource) && isRetryableLoadable(currentMapped)) currentMapped.stop();
					currentMapped = undefined;
					applyLoadable(resolvedSource as MaybeLoadable<LoadableStateMapResult<T, U, S>>);
					return;
				}

				const nextMapped = unref(mapper(getLoadableStateValue(resolvedSource, stateToMatch))) as MaybeLoadable<U>;
				if (currentMapped && currentMapped !== nextMapped && isRetryableLoadable(currentMapped)) currentMapped.stop();
				currentMapped = nextMapped;
				applyLoadable(nextMapped as MaybeLoadable<LoadableStateMapResult<T, U, S>>);
			}),
		() => [currentSource, currentMapped],
	);
}

function flatMapOptionalSingleLoadableReactive<T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T | undefined) => MaybeRefLoadable<U>): ControlledLoadable<U> {
	let currentSource: MaybeLoadable<T> = Loadable.Empty<T>();
	let currentMapped: MaybeLoadable<U> | undefined;

	return createDerivedLoadable<U>(
		applyLoadable =>
			watchEffect(() => {
				const resolvedSource = unref(loadable) as MaybeLoadable<T>;
				currentSource = resolvedSource;

				if (!isLoaded(resolvedSource) && !isEmpty(resolvedSource)) {
					if (currentMapped && !isSameLoadable(currentMapped, resolvedSource) && isRetryableLoadable(currentMapped)) currentMapped.stop();
					currentMapped = undefined;
					applyLoadable(resolvedSource as unknown as MaybeLoadable<U>);
					return;
				}

				const nextMapped = unref(mapper(isLoaded(resolvedSource) ? resolvedSource.value : undefined)) as MaybeLoadable<U>;
				if (currentMapped && currentMapped !== nextMapped && isRetryableLoadable(currentMapped)) currentMapped.stop();
				currentMapped = nextMapped;
				applyLoadable(nextMapped);
			}),
		() => [currentSource, currentMapped],
	);
}

export function mapLoadableReactive<T, U, S extends LoadableState.loaded>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: T) => U): ControlledLoadable<U>;
export function mapLoadableReactive<T, U, S extends LoadableState.error>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: ApiError) => U): ControlledLoadable<U | T>;
export function mapLoadableReactive<T, U, S extends LoadableState.empty>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => U): ControlledLoadable<U | T>;
export function mapLoadableReactive<T, U, S extends LoadableState.loading>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => U): ControlledLoadable<U | T>;
export function mapLoadableReactive<T, U, S extends LoadableState>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: LoadableStateValue<T, S>) => U): ControlledLoadable<U | T> {
	return flatMapSingleLoadableReactive(loadable, state, value => Loadable.Loaded(mapper(value as LoadableStateValue<T, S>)));
}

export function flatMapLoadableReactive<T, U, S extends LoadableState.loaded>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: T) => MaybeRefLoadable<U>): ControlledLoadable<U>;
export function flatMapLoadableReactive<T, U, S extends LoadableState.error>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: ApiError) => MaybeRefLoadable<U>): ControlledLoadable<U | T>;
export function flatMapLoadableReactive<T, U, S extends LoadableState.empty>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => MaybeRefLoadable<U>): ControlledLoadable<U | T>;
export function flatMapLoadableReactive<T, U, S extends LoadableState.loading>(loadable: MaybeRefLoadable<T>, state: S, mapper: (value: undefined) => MaybeRefLoadable<U>): ControlledLoadable<U | T>;
export function flatMapLoadableReactive<T, U, S extends LoadableState>(
	loadable: MaybeRefLoadable<T>,
	state: S,
	mapper: (value: LoadableStateValue<T, S>) => MaybeRefLoadable<U>,
): ControlledLoadable<U | T> {
	return flatMapSingleLoadableReactive(loadable, state, mapper);
}

export function mapReactive<T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T) => U): ControlledLoadable<U> {
	return mapLoadableReactive(loadable, LoadableState.loaded, mapper);
}

export function flatMapReactive<T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T) => MaybeRefLoadable<U>): ControlledLoadable<U> {
	return flatMapLoadableReactive(loadable, LoadableState.loaded, mapper);
}

export const mapLoadedReactive = mapReactive;
export const flatMapLoadedReactive = flatMapReactive;
export const mapErrorReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: ApiError) => U) => mapLoadableReactive(loadable, LoadableState.error, mapper);
export const transformErrorReactive = <T>(loadable: MaybeRefLoadable<T>, mapper: (error: ApiError) => ApiError) =>
	flatMapLoadableReactive(loadable, LoadableState.error, error => Loadable.LoadingError<T>(mapper(error)));
export const mapEmptyReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => U) => mapLoadableReactive(loadable, LoadableState.empty, mapper);
export const mapLoadingReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => U) => mapLoadableReactive(loadable, LoadableState.loading, mapper);
export const flatMapErrorReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: ApiError) => MaybeRefLoadable<U>) => flatMapLoadableReactive(loadable, LoadableState.error, mapper);
export const flatMapEmptyReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => MaybeRefLoadable<U>) => flatMapLoadableReactive(loadable, LoadableState.empty, mapper);
export const flatMapLoadingReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: undefined) => MaybeRefLoadable<U>) => flatMapLoadableReactive(loadable, LoadableState.loading, mapper);
export const recoverReactive = <T>(loadable: MaybeRefLoadable<T>, mapper: (value: ApiError) => T) => mapLoadableReactive(loadable, LoadableState.error, mapper);
export const orReactive = <T>(loadable: MaybeRefLoadable<T>, mapper: () => T | null | undefined) =>
	flatMapEmptyReactive(loadable, () => {
		const value = mapper();
		return value != null ? Loadable.Loaded(value) : Loadable.Empty<T>();
	});
export const mapOptionalReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T | undefined) => U) =>
	flatMapOptionalSingleLoadableReactive(loadable, value => Loadable.Loaded(mapper(value)));
export const flatMapOptionalReactive = <T, U>(loadable: MaybeRefLoadable<T>, mapper: (value: T | undefined) => MaybeRefLoadable<U>) => flatMapOptionalSingleLoadableReactive(loadable, mapper);

function thisMapReactive<T, U>(this: MaybeRefLoadable<T>, mapper: (value: T) => U): ControlledLoadable<U> {
	return mapReactive(this, mapper);
}

function thisMapOptionalReactive<T, U>(this: MaybeRefLoadable<T>, mapper: (value: T | undefined) => U): ControlledLoadable<U> {
	return mapOptionalReactive(this, mapper);
}

function thisMapErrorReactive<T>(this: MaybeRefLoadable<T>, mapper: (error: ApiError) => ApiError): ControlledLoadable<T> {
	return transformErrorReactive(this, mapper) as ControlledLoadable<T>;
}

function thisRecoverReactive<T>(this: MaybeRefLoadable<T>, mapper: (error: ApiError) => T): ControlledLoadable<T> {
	return recoverReactive(this, mapper);
}

function thisFlatMapReactive<T, U>(this: MaybeRefLoadable<T>, mapper: (value: T) => MaybeRefLoadable<U>): ControlledLoadable<U> {
	return flatMapReactive(this, mapper);
}

function thisFlatMapOptionalReactive<T, U>(this: MaybeRefLoadable<T>, mapper: (value: T | undefined) => MaybeRefLoadable<U>): ControlledLoadable<U> {
	return flatMapOptionalReactive(this, mapper);
}

function thisFlatMapErrorReactive<T, U>(this: MaybeRefLoadable<T>, mapper: (error: ApiError) => MaybeRefLoadable<U>): ControlledLoadable<T | U> {
	return flatMapErrorReactive(this, mapper) as ControlledLoadable<T | U>;
}

function thisOrReactive<T>(this: MaybeRefLoadable<T>, mapper: () => T | null | undefined): ControlledLoadable<T> {
	return orReactive(this, mapper);
}

const reactiveLoadableMethods = {
	map: thisMapReactive,
	mapOptional: thisMapOptionalReactive,
	mapError: thisMapErrorReactive,
	recover: thisRecoverReactive,
	flatMap: thisFlatMapReactive,
	flatMapOptional: thisFlatMapOptionalReactive,
	flatMapError: thisFlatMapErrorReactive,
	or: thisOrReactive,
} satisfies Partial<LoadableBase<any>>;
