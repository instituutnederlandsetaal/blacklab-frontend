import cloneDeep from 'clone-deep';
import type { App } from 'vue';
import { reactive, watch } from 'vue';

type GetterRegistry = Map<string, () => unknown>;
type Mutation = {
	type: string;
	payload: unknown;
};
type MutationSubscriber<RootState> = (mutation: Mutation, state: RootState) => void;
type GetterValues = Record<string, unknown>;
type StoreWatchOptions = {
	deep?: boolean;
	immediate?: boolean;
};

type RootReader<RootState, Value> = (
	state: RootState,
	getters: GetterValues,
	rootState: RootState,
	rootGetters: GetterValues,
) => Value;
type ModuleReader<ModuleState, RootState, Value> = (
	state: ModuleState,
	getters: GetterValues,
	rootState: RootState,
	rootGetters: GetterValues,
) => Value;
type RootDispatchContext<RootState> = {
	state: RootState;
	rootState: RootState;
};
type ModuleDispatchContext<ModuleState, RootState> = {
	state: ModuleState;
	rootState: RootState;
};

const createGetterProxy = (registry: GetterRegistry): GetterValues => new Proxy({}, {
	get: (_target, property) => {
		const getter = registry.get(String(property));
		return getter?.();
	}
}) as GetterValues;

const cloneInitialState = <State>(state: State): State => {
	if (state === null || state === undefined) {
		return state;
	}
	if (typeof state !== 'object') {
		return state;
	}
	return cloneDeep(state);
};

class ReactiveStore<RootState extends Record<string, any>> {
	constructor(
		public readonly state: RootState,
		private readonly subscribers: Set<MutationSubscriber<RootState>>,
	) {}

	install(app: App) {
		app.config.globalProperties.$store = this;
		app.provide('store', this);
	}

	watch<Value>(
		selector: (state: RootState) => Value,
		callback: (current: Value, previous: Value | undefined) => void,
		options?: StoreWatchOptions,
	) {
		return watch(
			() => selector(this.state),
			(current, previous) => callback(current, previous),
			options,
		);
	}

	subscribe(callback: MutationSubscriber<RootState>) {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}
}

class RootBuilder<RootState extends Record<string, any>> {
	private readonly rootState = reactive({}) as RootState;
	private readonly rootGetterRegistry: GetterRegistry = new Map();
	private readonly moduleBuilders = new Map<string, ReactiveModuleBuilder<any, RootState>>();
	private readonly subscribers = new Set<MutationSubscriber<RootState>>();
	private readonly rootGetterValues = createGetterProxy(this.rootGetterRegistry);
	public _store: ReactiveStore<RootState> | null = null;

	state() {
		return () => this.rootState;
	}

	read<Value>(reader: RootReader<RootState, Value>, name: string) {
		const getter = () => reader(this.rootState, this.rootGetterValues, this.rootState, this.rootGetterValues);
		this.rootGetterRegistry.set(name, getter);
		return getter;
	}

	commit<Payload = void, Result = void>(mutator: (state: RootState, payload: Payload) => Result, name: string) {
		return (payload?: Payload) => this.finalizeMutation(name, payload, mutator(this.rootState, payload as Payload));
	}

	dispatch<Payload = void, Result = void>(
		action: (context: RootDispatchContext<RootState>, payload: Payload) => Result,
		name: string,
	) {
		return (payload?: Payload) => this.finalizeMutation(name, payload, action({ state: this.rootState, rootState: this.rootState }, payload as Payload));
	}

	module<ModuleState>(namespace: string, initialState: ModuleState) {
		return this.getOrCreateModule([namespace], initialState);
	}

	vuexStore(options: { state?: Partial<RootState> }) {
		if (options.state) {
			Object.assign(this.rootState as object, options.state);
		}
		if (!this._store) {
			this._store = new ReactiveStore(this.rootState, this.subscribers);
		}
		return this._store;
	}

	getRootState() {
		return this.rootState;
	}

	getRootGetterValues() {
		return this.rootGetterValues;
	}

	getOrCreateModule<ModuleState>(path: string[], initialState: ModuleState) {
		const key = path.join('/');
		const existing = this.moduleBuilders.get(key);
		if (existing) {
			return existing as ReactiveModuleBuilder<ModuleState, RootState>;
		}

		this.ensureModuleState(path, initialState);
		const builder = new ReactiveModuleBuilder<ModuleState, RootState>(this, path, initialState);
		this.moduleBuilders.set(key, builder as ReactiveModuleBuilder<any, RootState>);
		return builder;
	}

	ensureModuleState<ModuleState>(path: string[], initialState: ModuleState): ModuleState {
		let cursor: any = this.rootState;
		for (const segment of path.slice(0, -1)) {
			if (!(segment in cursor) || cursor[segment] == null) {
				cursor[segment] = {};
			}
			cursor = cursor[segment];
		}

		const lastSegment = path[path.length - 1];
		if (!(lastSegment in cursor)) {
			cursor[lastSegment] = cloneInitialState(initialState);
		}
		return cursor[lastSegment] as ModuleState;
	}

	deleteModuleState(path: string[]) {
		const key = path.join('/');
		this.moduleBuilders.delete(key);

		let cursor: any = this.rootState;
		for (const segment of path.slice(0, -1)) {
			if (cursor == null) {
				return;
			}
			cursor = cursor[segment];
		}
		if (cursor != null) {
			delete cursor[path[path.length - 1]];
		}
	}

	finalizeMutation<Result>(type: string, payload: unknown, result: Result): Result {
		const maybePromise = result as Result & { finally?: (callback: () => void) => unknown };
		if (maybePromise && typeof maybePromise.finally === 'function') {
			maybePromise.finally(() => this.emitMutation(type, payload));
			return result;
		}

		this.emitMutation(type, payload);
		return result;
	}

	private emitMutation(type: string, payload: unknown) {
		const mutation: Mutation = { type, payload };
		for (const subscriber of this.subscribers) {
			subscriber(mutation, this.rootState);
		}
	}
}

class ReactiveModuleBuilder<ModuleState, RootState extends Record<string, any>> {
	private readonly getterRegistry: GetterRegistry = new Map();
	private readonly getterValues = createGetterProxy(this.getterRegistry);

	constructor(
		private readonly rootBuilder: RootBuilder<RootState>,
		private readonly path: string[],
		private readonly initialState: ModuleState,
	) {}

	get _store() {
		return this.rootBuilder._store;
	}

	state() {
		return () => this.getCurrentState();
	}

	read<Value>(reader: ModuleReader<ModuleState, RootState, Value>, name: string) {
		const getter = () => reader(this.getCurrentState(), this.getterValues, this.rootBuilder.getRootState(), this.rootBuilder.getRootGetterValues());
		this.getterRegistry.set(name, getter);
		return getter;
	}

	commit<Payload = void, Result = void>(mutator: (state: ModuleState, payload: Payload) => Result, name: string) {
		return (payload?: Payload) => this.rootBuilder.finalizeMutation(this.qualify(name), payload, mutator(this.getCurrentState(), payload as Payload));
	}

	dispatch<Payload = void, Result = void>(
		action: (context: ModuleDispatchContext<ModuleState, RootState>, payload: Payload) => Result,
		name: string,
	) {
		return (payload?: Payload) => this.rootBuilder.finalizeMutation(
			this.qualify(name),
			payload,
			action({ state: this.getCurrentState(), rootState: this.rootBuilder.getRootState() }, payload as Payload),
		);
	}

	module<ChildState>(namespace: string, initialState: ChildState) {
		return this.rootBuilder.getOrCreateModule([...this.path, namespace], initialState);
	}

	deleteModule(namespace: string) {
		this.rootBuilder.deleteModuleState([...this.path, namespace]);
	}

	private getCurrentState() {
		return this.rootBuilder.ensureModuleState(this.path, this.initialState);
	}

	private qualify(name: string) {
		return `${this.path.join('/')}/${name}`;
	}
}

const rootBuilder = new RootBuilder<Record<string, any>>();

export function getStoreBuilder<RootState extends Record<string, any>>() {
	return rootBuilder as RootBuilder<RootState>;
}

export type ModuleBuilder<ModuleState, RootState extends Record<string, any>> = ReactiveModuleBuilder<ModuleState, RootState>;
export type ReactiveStoreCompat<RootState extends Record<string, any>> = ReactiveStore<RootState>;
