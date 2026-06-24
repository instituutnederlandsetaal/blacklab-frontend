import { describe, expect, test, vi } from "vitest";
import { nextTick, ref, shallowRef, watch, type Ref } from "vue";

import { ApiError, CancelableRequest } from "@/shared/api/lib/api-types";
import { Loadable, LoadableState, type LoadableLike } from "@/shared/utils/loadable/loadable";
import {
  combineLoadablesValue,
  mapLoadedValue,
  flatMapLoadedValue,
} from "@/shared/utils/loadable/loadable-operators";
import {
  combineLoadablesReactive,
  flatMapEmptyReactive,
  flatMapErrorReactive,
  flatMapLoadedReactive,
  flatMapLoadingReactive,
  combineLoadables,
  loadableFromComputedRequest,
  loadableFromRefs,
  loadableFromRequest,
  mapEmptyReactive,
  mapErrorReactive,
  mapLoadedReactive,
  mapLoadingReactive,
  resolveMaybeRefLoadables,
} from "@/shared/utils/loadable/loadable-reactive";

function createControlledLoadable<T>(
  initial: Loadable<T>,
  extra: Partial<{ retry: () => void; stop: () => void }> = {},
) {
  const state = ref(initial.state);
  const value = ref(initial.value);
  const error = ref(initial.error);

  return {
    state,
    value,
    error,
    loadable: loadableFromRefs(state, value, error, {
      retry: vi.fn<() => void>(),
      stop: vi.fn<() => void>(),
      ...extra,
    }),
  };
}

function createDeferredRequest<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const cancel = vi.fn<() => void>();
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    request: new CancelableRequest(promise, cancel),
    resolve,
    reject,
    cancel,
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("non-reactive loadable primitives", () => {
  test("combineLoadablesValue combines loaded arrays", () => {
    const result = combineLoadablesValue([Loadable.Loaded(1), Loadable.Loaded(2)] as const);

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toEqual([1, 2]);
  });

  test("combineLoadablesValue passes through first non-loaded state", () => {
    const result = combineLoadablesValue([
      Loadable.Loaded(1),
      Loadable.Empty<number>(),
      Loadable.Loading(),
    ] as const);

    expect(result.state).toBe(LoadableState.empty);
  });

  test("mapLoadedValue maps only for fully loaded input", () => {
    const loaded = mapLoadedValue(
      { a: Loadable.Loaded(2), b: Loadable.Loaded(3) },
      ({ a, b }) => a + b,
    );
    expect(loaded.state).toBe(LoadableState.loaded);
    expect(loaded.value).toBe(5);

    const notLoaded = mapLoadedValue(
      { a: Loadable.Loading<number>(), b: Loadable.Loaded(3) },
      ({ a, b }) => a + b,
    );
    expect(notLoaded.state).toBe(LoadableState.loading);
  });

  test("flatMapLoadedValue maps to loadable only for fully loaded input", () => {
    const loaded = flatMapLoadedValue([Loadable.Loaded(4), Loadable.Loaded(5)] as const, ([a, b]) =>
      Loadable.Loaded(a * b),
    );
    expect(loaded.state).toBe(LoadableState.loaded);
    expect(loaded.value).toBe(20);

    const notLoaded = flatMapLoadedValue(
      [Loadable.Loaded(4), Loadable.Loading<number>()] as const,
      ([a, b]) => Loadable.Loaded(a * b),
    );
    expect(notLoaded.state).toBe(LoadableState.loading);
  });

  test("resolveMaybeRefLoadables unwraps refs and plain values", () => {
    const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
    const b = Loadable.Loaded(2);
    const resolved = resolveMaybeRefLoadables([a, b] as const);

    expect(resolved[0].state).toBe(LoadableState.loaded);
    expect(resolved[0].value).toBe(1);
    expect(resolved[1].state).toBe(LoadableState.loaded);
    expect(resolved[1].value).toBe(2);
  });

  test("resolveMaybeRefLoadables unwraps object inputs", () => {
    const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
    const b = Loadable.Empty<number>();
    const resolved = resolveMaybeRefLoadables({ a, b });

    expect(resolved.a.state).toBe(LoadableState.loaded);
    expect(resolved.a.value).toBe(1);
    expect(resolved.b.state).toBe(LoadableState.empty);
  });

  test("combineLoadablesValue accepts plain LoadableLike shape", () => {
    const a: LoadableLike<number> = { state: LoadableState.loaded, value: 1, error: undefined };
    const b: LoadableLike<number> = { state: LoadableState.loaded, value: 2, error: undefined };
    const result = combineLoadablesValue([a, b] as const);

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toEqual([1, 2]);
  });

  test("combineLoadablesValue passes through original non-loaded LoadableLike", () => {
    const loadingLike: LoadableLike<number> = {
      state: LoadableState.loading,
      value: undefined,
      error: undefined,
    };
    const result = combineLoadablesValue([loadingLike, Loadable.Loaded(2)] as const);

    expect(result).toBe(loadingLike);
  });
});

describe("combineLoadablesReactive", () => {
  test("combines maybeRef loadables in arrays", () => {
    const a: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
    const b = Loadable.Loaded(2);

    const combined = combineLoadablesReactive([a, b] as const);

    expect(combined.state).toBe(LoadableState.loaded);
    expect(combined.value).toEqual([1, 2]);

    a.value = Loadable.Loading();
    expect(combined.state).toBe(LoadableState.loading);
  });

  test("combines maybeRef loadables in objects", () => {
    const a: Ref<Loadable<string>> = ref(Loadable.Loaded("x"));
    const b: Ref<Loadable<string>> = ref(Loadable.Loaded("y"));

    const combined = combineLoadablesReactive({ a, b });

    expect(combined.state).toBe(LoadableState.loaded);
    expect(combined.value).toEqual({ a: "x", b: "y" });

    b.value = Loadable.Empty();
    expect(combined.state).toBe(LoadableState.empty);
  });

  test("supports includeEmpty through the reactive alias", () => {
    const loaded: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
    const empty: Ref<Loadable<number>> = ref(Loadable.Empty());

    const combined = combineLoadablesReactive([loaded, empty] as const, { includeEmpty: true });

    expect(combined.state).toBe(LoadableState.loaded);
    expect(combined.value).toEqual([1, undefined]);
  });
});

describe("loadableFromLoadables", () => {
  test("keeps value hidden until every input is loaded and surfaces the first unsettled state", () => {
    const first = createControlledLoadable(Loadable.Loading<number>());
    const second = createControlledLoadable(Loadable.Loading<number>());
    const combined = combineLoadables([first.loadable, second.loadable] as const);

    expect(combined.state).toBe(LoadableState.loading);
    expect(combined.value).toBeUndefined();
    expect(combined.error).toBeUndefined();

    first.value.value = 1;
    first.state.value = LoadableState.loaded;
    expect(combined.state).toBe(LoadableState.loading);
    expect(combined.value).toBeUndefined();

    const failure = new ApiError("boom", "boom", "broken", 500);
    second.error.value = failure;
    second.state.value = LoadableState.error;
    expect(combined.state).toBe(LoadableState.error);
    expect(combined.error).toBe(failure);
    expect(combined.value).toBeUndefined();
  });

  test("fans out retry and stop to retryable inputs only", () => {
    const retryA = vi.fn<() => void>();
    const stopA = vi.fn<() => void>();
    const retryB = vi.fn<() => void>();
    const stopB = vi.fn<() => void>();
    const first = createControlledLoadable(Loadable.Loading<number>(), {
      retry: retryA,
      stop: stopA,
    });
    const second = createControlledLoadable(Loadable.Loading<number>(), {
      retry: retryB,
      stop: stopB,
    });
    const combined = combineLoadables([
      first.loadable,
      second.loadable,
      Loadable.Loaded(3),
    ] as const);

    combined.retry();
    combined.stop();

    expect(retryA).toHaveBeenCalledTimes(1);
    expect(retryB).toHaveBeenCalledTimes(1);
    expect(stopA).toHaveBeenCalledTimes(1);
    expect(stopB).toHaveBeenCalledTimes(1);
  });

  test("fans out retry and stop once per unique retryable input", () => {
    const retry = vi.fn<() => void>();
    const stop = vi.fn<() => void>();
    const source = createControlledLoadable(Loadable.Loading<number>(), { retry, stop });
    const combined = combineLoadables([source.loadable, source.loadable] as const);

    combined.retry();
    combined.stop();

    expect(retry).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test("fans out retry through object inputs", () => {
    const retry = vi.fn<() => void>();
    const source = createControlledLoadable(Loadable.Loading<number>(), { retry });
    const combined = combineLoadables({ source: source.loadable });

    combined.retry();

    expect(retry).toHaveBeenCalledTimes(1);
  });

  test("supports treating empty inputs as settled", () => {
    const loaded = createControlledLoadable(Loadable.Loaded(1));
    const empty = createControlledLoadable(Loadable.Empty<number>());
    const combined = combineLoadables([loaded.loadable, empty.loadable] as const, {
      includeEmpty: true,
    });

    expect(combined.state).toBe(LoadableState.loaded);
    expect(combined.value).toEqual([1, undefined]);
    expect(combined.error).toBeUndefined();
  });

  test("supports treating empty object inputs as settled", () => {
    const loaded = createControlledLoadable(Loadable.Loaded(1));
    const empty = createControlledLoadable(Loadable.Empty<number>());
    const combined = combineLoadables(
      { loaded: loaded.loadable, empty: empty.loadable },
      { includeEmpty: true },
    );

    expect(combined.state).toBe(LoadableState.loaded);
    expect(combined.value).toEqual({ loaded: 1, empty: undefined });
  });

  test("passes through unresolved states when treating empty inputs as settled", () => {
    const empty = createControlledLoadable(Loadable.Empty<number>());
    const loading = createControlledLoadable(Loadable.Loading<number>());
    const combined = combineLoadables([empty.loadable, loading.loadable] as const, {
      includeEmpty: true,
    });

    expect(combined.state).toBe(LoadableState.loading);
    expect(combined.value).toBeUndefined();
  });

  test("does not trigger watchers when an input settles but the exposed output stays the same", () => {
    const first = createControlledLoadable(Loadable.Loading<number>());
    const second = createControlledLoadable(Loadable.Loading<number>());
    const combined = combineLoadables([first.loadable, second.loadable] as const);
    const onStateChange =
      vi.fn<(value: LoadableState, oldValue: LoadableState | undefined) => void>();
    const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();

    watch(() => combined.state, onStateChange, { immediate: true, flush: "sync" });
    watch(() => combined.value, onValueChange, { immediate: true, flush: "sync" });

    first.value.value = 1;
    first.state.value = LoadableState.loaded;
    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledTimes(1);

    second.value.value = 2;
    second.state.value = LoadableState.loaded;
    expect(onStateChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(combined.value).toEqual([1, 2]);
  });

  test("reuses the combined loaded value when the underlying loaded values are unchanged", () => {
    const shared = { id: 1 };
    const first: Ref<Loadable<{ id: number }>> = ref(Loadable.Loaded(shared));
    const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
    const combined = combineLoadables([first, second] as const);
    const onValueChange = vi.fn<(value: unknown, oldValue: unknown) => void>();
    const initialValue = combined.value;

    watch(() => combined.value, onValueChange, { immediate: true, flush: "sync" });

    first.value = Loadable.Loaded(shared);

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(combined.value).toBe(initialValue);
  });

  test("reuses object combined values only when entries are unchanged", () => {
    const shared = { id: 1 };
    const first: Ref<Loadable<{ id: number }>> = ref(Loadable.Loaded(shared));
    const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
    const combined = combineLoadables({ first, second });
    const initialValue = combined.value;

    first.value = Loadable.Loaded(shared);
    expect(combined.value).toBe(initialValue);

    first.value = Loadable.Loaded({ id: 1 });
    expect(combined.value).not.toBe(initialValue);
    expect(combined.value).toEqual({ first: { id: 1 }, second: 2 });
  });
});

describe("mapLoadedReactive", () => {
  test("maps a single loadable input", () => {
    const source: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
    const result = mapLoadedReactive(source, (value) => value + 1);

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe(3);
  });

  test("maps only when all inputs are loaded (array)", () => {
    const first: Ref<Loadable<number>> = ref(Loadable.Loading<number>());
    const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
    const mapper = vi.fn<(values: readonly [number, number]) => number>(([a, b]) => a + b);

    const result = mapLoadedReactive([first, second] as const, mapper);

    expect(result.state).toBe(LoadableState.loading);
    expect(mapper).not.toHaveBeenCalled();

    first.value = Loadable.Loaded(3);
    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe(5);
    expect(mapper).toHaveBeenCalledTimes(1);

    first.value = Loadable.Loaded(4);
    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe(6);
    expect(mapper).toHaveBeenCalledTimes(2);

    second.value = Loadable.Loading();
    expect(result.state).toBe(LoadableState.loading);
    expect(mapper).toHaveBeenCalledTimes(2);
  });

  test("maps only when all inputs are loaded (object)", () => {
    const a: Ref<Loadable<string>> = ref(Loadable.Loaded("foo"));
    const b: Ref<Loadable<string>> = ref(Loadable.Loaded("bar"));
    const mapper = vi.fn<(values: { a: string; b: string }) => string>(({ a, b }) => `${a}-${b}`);

    const result = mapLoadedReactive({ a, b }, mapper);

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe("foo-bar");
    expect(mapper).toHaveBeenCalledTimes(1);

    a.value = Loadable.LoadingError(new ApiError("err", "nope", "bad request", 400));
    expect(result.state).toBe(LoadableState.error);
    expect(mapper).toHaveBeenCalledTimes(1);
  });
});

describe("state-specific reactive mappers", () => {
  test("mapErrorReactive maps error values", () => {
    const error = new ApiError("Title", "Message", "Bad Request", 400);
    const result = mapErrorReactive(
      Loadable.LoadingError<number>(error),
      (value) => value.statusText,
    );

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe("Bad Request");
  });

  test("mapEmptyReactive and mapLoadingReactive map undefined state values", () => {
    const empty = mapEmptyReactive(Loadable.Empty<number>(), () => "empty");
    const loading = mapLoadingReactive(Loadable.Loading<number>(), () => "loading");

    expect(empty.state).toBe(LoadableState.loaded);
    expect(empty.value).toBe("empty");
    expect(loading.state).toBe(LoadableState.loaded);
    expect(loading.value).toBe("loading");
  });

  test("flatMap state helpers map their matching states", () => {
    const error = new ApiError("Title", "Message", "Bad Request", 400);
    const mappedError = flatMapErrorReactive(Loadable.LoadingError<number>(error), (value) =>
      Loadable.Loaded(value.httpCode),
    );
    const mappedEmpty = flatMapEmptyReactive(Loadable.Empty<number>(), () =>
      Loadable.Loaded("empty"),
    );
    const mappedLoading = flatMapLoadingReactive(Loadable.Loading<number>(), () =>
      Loadable.Loaded("loading"),
    );

    expect(mappedError.value).toBe(400);
    expect(mappedEmpty.value).toBe("empty");
    expect(mappedLoading.value).toBe("loading");
  });
});

describe("loadableFromRequest", () => {
  test("starts immediately and exposes the resolved value", async () => {
    const deferred = createDeferredRequest<number>();
    const makeRequest = vi.fn<() => CancelableRequest<number>>(() => deferred.request);

    const loadable = loadableFromRequest(makeRequest);

    expect(makeRequest).toHaveBeenCalledTimes(1);
    expect(loadable.state).toBe(LoadableState.empty);

    deferred.resolve(42);
    await flushPromises();

    expect(loadable.state).toBe(LoadableState.loaded);
    expect(loadable.value).toBe(42);

    loadable.stop();
    expect(deferred.cancel).toHaveBeenCalledTimes(1);
  });

  test("wraps failed requests as ApiError values", async () => {
    const deferred = createDeferredRequest<number>();
    const loadable = loadableFromRequest(() => deferred.request);

    deferred.reject(new Error("network failed"));
    await flushPromises();

    expect(loadable.state).toBe(LoadableState.error);
    expect(loadable.value).toBeUndefined();
    expect(loadable.error).toBeInstanceOf(ApiError);
    expect(loadable.error?.message).toBe("network failed");
  });

  test("returns to empty when the request is cancelled through ApiError", async () => {
    const deferred = createDeferredRequest<number>();
    const loadable = loadableFromRequest(() => deferred.request);

    deferred.reject(ApiError.CANCELLED);
    await flushPromises();

    expect(loadable.state).toBe(LoadableState.empty);
    expect(loadable.value).toBeUndefined();
    expect(loadable.error).toBeUndefined();
  });

  test("returns to empty when the request is cancelled through axios", async () => {
    const deferred = createDeferredRequest<number>();
    const loadable = loadableFromRequest(() => deferred.request);

    deferred.reject({ __CANCEL__: true });
    await flushPromises();

    expect(loadable.state).toBe(LoadableState.empty);
    expect(loadable.value).toBeUndefined();
    expect(loadable.error).toBeUndefined();
  });

  test("retry cancels and ignores stale request results", async () => {
    const first = createDeferredRequest<number>();
    const second = createDeferredRequest<number>();
    const makeRequest = vi
      .fn<() => CancelableRequest<number>>()
      .mockReturnValueOnce(first.request)
      .mockReturnValueOnce(second.request);
    const loadable = loadableFromRequest(makeRequest);

    loadable.retry();

    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(makeRequest).toHaveBeenCalledTimes(2);

    first.resolve(1);
    await flushPromises();
    expect(loadable.state).toBe(LoadableState.empty);

    second.resolve(2);
    await flushPromises();
    expect(loadable.state).toBe(LoadableState.loaded);
    expect(loadable.value).toBe(2);
  });

  test("retry ignores stale request errors", async () => {
    const first = createDeferredRequest<number>();
    const second = createDeferredRequest<number>();
    const makeRequest = vi
      .fn<() => CancelableRequest<number>>()
      .mockReturnValueOnce(first.request)
      .mockReturnValueOnce(second.request);
    const loadable = loadableFromRequest(makeRequest);

    loadable.retry();
    first.reject(new Error("too late"));
    await flushPromises();

    expect(loadable.state).toBe(LoadableState.empty);
    expect(loadable.error).toBeUndefined();

    second.reject(new Error("current failed"));
    await flushPromises();
    expect(loadable.state).toBe(LoadableState.error);
    expect(loadable.error?.message).toBe("current failed");
  });
});

describe("loadableFromComputedRequest", () => {
  test("retries when the request ref changes", async () => {
    const first = createDeferredRequest<number>();
    const second = createDeferredRequest<number>();
    const request = shallowRef(first.request);
    const loadable = loadableFromComputedRequest(request);

    request.value = second.request;
    await nextTick();

    expect(first.cancel).toHaveBeenCalledTimes(1);

    first.resolve(1);
    await flushPromises();
    expect(loadable.state).toBe(LoadableState.empty);

    second.resolve(2);
    await flushPromises();
    expect(loadable.state).toBe(LoadableState.loaded);
    expect(loadable.value).toBe(2);
  });
});

describe("flatMapLoadedReactive variants", () => {
  test("flatMapLoadedReactive returns mapped loadable when all loaded", () => {
    const left: Ref<Loadable<number>> = ref(Loadable.Loaded(4));
    const right: Ref<Loadable<number>> = ref(Loadable.Loaded(5));

    const result = flatMapLoadedReactive([left, right] as const, ([a, b]) =>
      Loadable.Loaded(a * b),
    );

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe(20);
  });

  test("flatMapLoadedReactive passes through non-loaded states", () => {
    const first: Ref<Loadable<number>> = ref(Loadable.Empty<number>());
    const second: Ref<Loadable<number>> = ref(Loadable.Loaded(2));
    const mapper = vi.fn<(values: { first: number; second: number }) => Loadable<number>>(
      ({ first, second }) => Loadable.Loaded(first + second),
    );

    const result = flatMapLoadedReactive({ first, second }, mapper);

    expect(result.state).toBe(LoadableState.empty);
    expect(mapper).not.toHaveBeenCalled();

    first.value = Loadable.Loaded(8);
    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe(10);
    expect(mapper).toHaveBeenCalledTimes(1);
  });

  test("flatMapLoadedReactive chains from a single loadable and preserves control fanout", () => {
    const retrySource = vi.fn<() => void>();
    const stopSource = vi.fn<() => void>();
    const retryInner = vi.fn<() => void>();
    const stopInner = vi.fn<() => void>();
    const source = createControlledLoadable(Loadable.Loaded(2), {
      retry: retrySource,
      stop: stopSource,
    });
    const inner = createControlledLoadable(Loadable.Loaded(4), {
      retry: retryInner,
      stop: stopInner,
    });

    const result = flatMapLoadedReactive(source.loadable, (value) => {
      expect(value).toBe(2);
      return inner.loadable;
    });

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe(4);

    result.retry();
    expect(retrySource).toHaveBeenCalledTimes(1);
    expect(retryInner).toHaveBeenCalledTimes(1);

    result.stop();
    expect(stopSource).toHaveBeenCalledTimes(1);
    expect(stopInner).toHaveBeenCalledTimes(1);
  });

  test("flatMapLoadedReactive stops the previous mapped loadable when source stops matching", () => {
    const stopInner = vi.fn<() => void>();
    const source = createControlledLoadable(Loadable.Loaded(2));
    const inner = createControlledLoadable(Loadable.Loaded(4), {
      stop: stopInner,
    });
    const result = flatMapLoadedReactive(source.loadable, () => inner.loadable);

    source.state.value = LoadableState.loading;

    expect(result.state).toBe(LoadableState.loading);
    expect(stopInner).toHaveBeenCalledTimes(1);
  });

  test("flatMapLoadedReactive stops the previous mapped loadable when mapping changes", () => {
    const stopFirstInner = vi.fn<() => void>();
    const source: Ref<Loadable<number>> = ref(Loadable.Loaded(1));
    const firstInner = createControlledLoadable(Loadable.Loaded(10), {
      stop: stopFirstInner,
    });
    const secondInner = createControlledLoadable(Loadable.Loaded(20));
    const result = flatMapLoadedReactive(source, (value) =>
      value === 1 ? firstInner.loadable : secondInner.loadable,
    );

    source.value = Loadable.Loaded(2);

    expect(result.state).toBe(LoadableState.loaded);
    expect(result.value).toBe(20);
    expect(stopFirstInner).toHaveBeenCalledTimes(1);
  });

  test("loadableFromRefs state check functions work as expected", () => {
    const state = ref(LoadableState.loaded);
    const value = ref(42);
    const error = ref<ApiError | undefined>(undefined);
    const loadable = loadableFromRefs(state, value, error);
    expect(loadable.state).toBe(LoadableState.loaded);
    expect(loadable.value).toBe(42);
    expect(loadable.error).toBeUndefined();
    expect(loadable.isLoaded()).toBe(true);

    state.value = LoadableState.error;
    expect(loadable.isError()).toBe(true);
    expect(loadable.isLoaded()).toBe(false);
  });

  test("loadableFromRefs exposes mapper instance functions", () => {
    const state = ref(LoadableState.loaded);
    const value = ref<number | undefined>(42);
    const error = ref<ApiError | undefined>(undefined);
    const loadable = loadableFromRefs(state, value, error);

    expect(loadable.map(v => v + 1)).toEqual(Loadable.Loaded(43));

    state.value = LoadableState.error;
    value.value = undefined;
    error.value = new ApiError("title", "message", "status", 500);

    expect(loadable.recover(() => 7)).toEqual(Loadable.Loaded(7));
    expect(loadable.flatMapError(() => Loadable.Empty<number>())).toEqual(Loadable.Empty());
  });
});
