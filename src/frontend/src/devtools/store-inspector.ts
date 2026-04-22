import * as RootStore from '@/app/state/root-store';
import * as ArticleStore from '@/features/article/model/article-state';
import * as CorpusStore from '@/features/corpus/model/corpus-state';
import * as HistoryStore from '@/features/history/model/query-history-state';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalResultsStore from '@/features/search/model/results/global-results-state';
import * as ViewsStore from '@/features/search/model/results/view-state';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import * as UIStore from '@/app/state/ui-state';

import { setupDevtoolsPlugin } from '@vue/devtools-api';
import { isRef, toRaw, unref, watch, type App } from 'vue';

const DEVTOOLS_PLUGIN_ID = 'blacklab-frontend-store-devtools';
const STORE_INSPECTOR_ID = 'blacklab-frontend-store-inspector';
const ALL_STORE_STATE_ID = 'all-store-state';
const ROOT_STORE_ID = 'store:root';

type InspectorField = {
	key: string;
	value: unknown;
	editable: boolean;
};

type InspectorState = Record<string, InspectorField[]>;

type InspectorNode = {
	id: string;
	label: string;
	children?: InspectorNode[];
};

type StoreLeaf = {
	id: string;
	label: string;
	readState?: () => unknown;
	readGetters: () => unknown;
	watchState?: () => unknown;
};

type StoreGroup = {
	id: string;
	label: string;
	children: StoreLeaf[];
};

type DevtoolsApi = Parameters<Parameters<typeof setupDevtoolsPlugin>[1]>[0];

const ROOT_STORE: StoreLeaf = {
	id: ROOT_STORE_ID,
	label: 'Root Store',
	readGetters: () => RootStore.get,
	watchState: () => RootStore.get.loadingState().value,
};

const STORE_GROUPS: StoreGroup[] = [
	{
		id: 'group:core',
		label: 'Core',
		children: [
			{ id: 'store:corpus', label: 'Corpus', readState: CorpusStore.getState, readGetters: () => CorpusStore.get },
			{ id: 'store:history', label: 'History', readState: HistoryStore.getState, readGetters: () => HistoryStore.get },
			{ id: 'store:query', label: 'Query', readState: QueryStore.getState, readGetters: () => QueryStore.get },
			{ id: 'store:tagset', label: 'Tagset', readState: TagsetStore.getState, readGetters: () => TagsetStore.get },
			{ id: 'store:ui', label: 'UI', readState: UIStore.getState, readGetters: () => UIStore.get },
			{ id: 'store:article', label: 'Article', readState: ArticleStore.getState, readGetters: () => ArticleStore.get },
		],
	},
	{
		id: 'group:form',
		label: 'Form',
		children: [
			{ id: 'store:explore', label: 'Explore', readState: ExploreStore.getState, readGetters: () => ExploreStore.get },
			{ id: 'store:filters', label: 'Filters', readState: FilterStore.getState, readGetters: () => FilterStore.get },
			{ id: 'store:interface', label: 'Interface', readState: InterfaceStore.getState, readGetters: () => InterfaceStore.get },
			{ id: 'store:patterns', label: 'Patterns', readState: PatternStore.getState, readGetters: () => PatternStore.get },
			{ id: 'store:gap', label: 'Gap', readState: GapStore.getState, readGetters: () => GapStore.get },
		],
	},
	{
		id: 'group:results',
		label: 'Results',
		children: [
			{ id: 'store:global-results', label: 'Global', readState: GlobalResultsStore.getState, readGetters: () => GlobalResultsStore.get },
			{
				id: 'store:views',
				label: 'Views',
				readState: ViewsStore.getState,
				readGetters: () => ViewsStore.get,
				watchState: () => ({
					state: ViewsStore.getState(),
				}),
			},
		],
	},
];

const STORE_LEAVES = [ROOT_STORE, ...STORE_GROUPS.flatMap(group => group.children)];

function unwrapInspectorValue(value: unknown): unknown {
	if (isRef(value)) {
		return unwrapInspectorValue(unref(value));
	}

	return value != null && typeof value === 'object' ? toRaw(value as object) : value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

function formatGetterError(error: unknown): { error: string } {
	if (error instanceof Error) {
		return { error: `${error.name}: ${error.message}` };
	}

	return { error: String(error) };
}

function evaluateGetterValue(value: unknown): unknown {
	if (typeof value === 'function') {
		if (value.length > 0) {
			return `[requires ${value.length} argument${value.length === 1 ? '' : 's'}]`;
		}

		try {
			return unwrapInspectorValue((value as () => unknown)());
		} catch (error) {
			return formatGetterError(error);
		}
	}

	return unwrapInspectorValue(value);
}

function makeGetterFields(getterTree: unknown, path: string[] = []): InspectorField[] {
	if (!isPlainRecord(getterTree)) {
		return path.length
			? [{
				key: path.join('.'),
				value: evaluateGetterValue(getterTree),
				editable: false,
			}]
			: [];
	}

	return Object.entries(getterTree).flatMap(([key, value]) => {
		const nextPath = [...path, key];
		return isPlainRecord(value)
			? makeGetterFields(value, nextPath)
			: [{
				key: nextPath.join('.'),
				value: evaluateGetterValue(value),
				editable: false,
			}];
	});
}

function makeGetterSnapshot(store: StoreLeaf): Record<string, unknown> | null {
	const getterFields = makeGetterFields(store.readGetters());
	if (!getterFields.length) {
		return null;
	}

	return Object.fromEntries(getterFields.map(field => [field.key, field.value]));
}

function makeStoreSnapshot(store: StoreLeaf): unknown {
	const snapshot: Record<string, unknown> = {};

	if (store.readState) {
		snapshot.state = unwrapInspectorValue(store.readState());
	}

	const getters = makeGetterSnapshot(store);
	if (getters) {
		snapshot.getters = getters;
	}

	return snapshot;
}

function makeRootStoreNode(filterText: string): InspectorNode | null {
	const filter = filterText.trim().toLowerCase();
	return !filter || ROOT_STORE.label.toLowerCase().includes(filter)
		? {
			id: ROOT_STORE.id,
			label: ROOT_STORE.label,
		}
		: null;
}

function toInspectorNode(group: StoreGroup): InspectorNode {
	return {
		id: group.id,
		label: group.label,
		children: group.children.map(store => ({
			id: store.id,
			label: store.label,
		})),
	};
}

function filterGroup(group: StoreGroup, filter: string): InspectorNode | null {
	if (!filter) {
		return toInspectorNode(group);
	}

	if (group.label.toLowerCase().includes(filter)) {
		return toInspectorNode(group);
	}

	const children = group.children
		.filter(store => store.label.toLowerCase().includes(filter))
		.map(store => ({
			id: store.id,
			label: store.label,
		}));

	return children.length
		? {
			id: group.id,
			label: group.label,
			children,
		}
		: null;
}

function makeInspectorTree(filterText: string): InspectorNode[] {
	const filter = filterText.trim().toLowerCase();
	const nodes: InspectorNode[] = [];

	if (!filter || 'all store state'.includes(filter)) {
		nodes.push({
			id: ALL_STORE_STATE_ID,
			label: 'All Store State',
		});
	}

	const rootStoreNode = makeRootStoreNode(filterText);
	if (rootStoreNode) {
		nodes.push(rootStoreNode);
	}

	STORE_GROUPS.forEach(group => {
		const node = filterGroup(group, filter);
		if (node) {
			nodes.push(node);
		}
	});

	return nodes;
}

function makeStoreField(store: StoreLeaf): InspectorField {
	return {
		key: store.label,
		value: makeStoreSnapshot(store),
		editable: false,
	};
}

function makeAllStoreState(): InspectorState {
	const state: InspectorState = {
		Root: [makeStoreField(ROOT_STORE)],
	};

	return STORE_GROUPS.reduce<InspectorState>((acc, group) => {
		acc[group.label] = group.children.map(makeStoreField);
		return acc;
	}, state);
}

function makeGroupState(group: StoreGroup): InspectorState {
	return {
		[group.label]: group.children.map(makeStoreField),
	};
}

function makeLeafState(store: StoreLeaf): InspectorState {
	const state: InspectorState = {};

	if (store.readState) {
		state.State = [{
			key: 'state',
			value: unwrapInspectorValue(store.readState()),
			editable: false,
		}];
	}

	const getterFields = makeGetterFields(store.readGetters());
	if (getterFields.length) {
		state.Getters = getterFields;
	}

	return state;
}

function makeInspectorState(nodeId: string): InspectorState {
	if (nodeId === ALL_STORE_STATE_ID) {
		return makeAllStoreState();
	}

	const group = STORE_GROUPS.find(candidate => candidate.id === nodeId);
	if (group) {
		return makeGroupState(group);
	}

	const store = STORE_LEAVES.find(candidate => candidate.id === nodeId);
	if (store) {
		return makeLeafState(store);
	}

	return {};
}

function createRefreshScheduler(api: DevtoolsApi): (includeTree?: boolean) => void {
	let refreshQueued = false;
	let treeRefreshRequested = false;

	return (includeTree = false) => {
		treeRefreshRequested = treeRefreshRequested || includeTree;
		if (refreshQueued) {
			return;
		}

		refreshQueued = true;
		queueMicrotask(() => {
			refreshQueued = false;
			if (treeRefreshRequested) {
				api.sendInspectorTree(STORE_INSPECTOR_ID);
			}
			api.sendInspectorState(STORE_INSPECTOR_ID);
			treeRefreshRequested = false;
		});
	};
}

export function installStoreInspectorDevtools(app: App): void {
	setupDevtoolsPlugin(
		{
			id: DEVTOOLS_PLUGIN_ID,
			label: 'Corpus Frontend Store',
			packageName: 'blacklab-frontend',
			app,
		},
		api => {
			const refreshInspector = createRefreshScheduler(api);

			api.addInspector({
				id: STORE_INSPECTOR_ID,
				label: 'Store State',
				icon: 'storage',
				treeFilterPlaceholder: 'Search store modules',
			});

			api.on.getInspectorTree(payload => {
				if (payload.app !== app || payload.inspectorId !== STORE_INSPECTOR_ID) {
					return;
				}

				payload.rootNodes = makeInspectorTree(payload.filter);
			});

			api.on.getInspectorState(payload => {
				if (payload.app !== app || payload.inspectorId !== STORE_INSPECTOR_ID) {
					return;
				}

				payload.state = makeInspectorState(payload.nodeId);
			});

			STORE_LEAVES.forEach(store => {
					const watchSource = store.watchState ?? store.readState ?? store.readGetters;
					watch(watchSource, () => {
					refreshInspector();
				}, { deep: true });
			});

			refreshInspector(true);
		}
	);
}