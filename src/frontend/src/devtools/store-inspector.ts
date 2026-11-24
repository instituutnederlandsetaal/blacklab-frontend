import { setupDevtoolsPlugin } from '@vue/devtools-api';
import { isRef, toRaw, unref, watch, type App, type Ref } from 'vue';

import * as ArticleStore from '@/app/state/article-configuration';
import * as UIStore from '@/app/state/ui-state';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import * as HistoryStore from '@/features/history/model/query-history-state';
import type { ResultsState } from '@/features/search/model/results/results-state';
import type { Corpus } from '@/types/apptypes';

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
};

type StoreGroup = {
	id: string;
	label: string;
	children: StoreLeaf[];
};

type InspectorStores = { root: StoreLeaf; groups: StoreGroup[]; leaves: StoreLeaf[] };

function inspectorStores(results: ResultsState, corpus: Readonly<Ref<Corpus | undefined>>): InspectorStores {
	const viewStates = () => Object.fromEntries([...results.views].map(([name, view]) => [name, view.state]));
	const root: StoreLeaf = {
		id: ROOT_STORE_ID,
		label: 'Root Store',
		readGetters: () => ({ viewedResultsSettings: () => results.selectedView?.state ?? null }),
	};

	const groups: StoreGroup[] = [
		{
			id: 'group:core',
			label: 'Core',
			children: [
				{ id: 'store:corpus', label: 'Corpus', readState: () => corpus.value, readGetters: () => {} },
				{ id: 'store:history', label: 'History', readState: HistoryStore.getState, readGetters: () => HistoryStore.get },
				{ id: 'store:tagset', label: 'Tagset', readState: TagsetStore.getState, readGetters: () => TagsetStore.get },
				{ id: 'store:ui', label: 'UI', readState: UIStore.getState, readGetters: () => UIStore.get },
				{ id: 'store:article', label: 'Article', readState: ArticleStore.getState, readGetters: () => ArticleStore.get },
			],
		},
		{
			id: 'group:results',
			label: 'Results',
			children: [
				{
					id: 'store:interface',
					label: 'Selected View',
					readState: () => ({ viewedResults: results.selectedViewName }),
					readGetters: () => ({ viewedResults: () => results.selectedViewName }),
				},
				{ id: 'store:global-results', label: 'Global', readState: () => results.settings, readGetters: () => ({}) },
				{
					id: 'store:views',
					label: 'Views',
					readState: viewStates,
					readGetters: () => ({}),
				},
			],
		},
	];

	return { root, groups, leaves: [root, ...groups.flatMap(group => group.children)] };
}

function unwrapInspectorValue(value: unknown): unknown {
	if (isRef(value)) {
		return unwrapInspectorValue(unref(value));
	}

	return value != null && typeof value === 'object' ? toRaw(value as object) : value;
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
	if (getterTree != null && typeof getterTree === 'object' && !Array.isArray(getterTree)) {
		return Object.entries(getterTree).flatMap(([key, value]) => makeGetterFields(value, [...path, key]));
	}
	return path.length ? [{ key: path.join('.'), value: evaluateGetterValue(getterTree), editable: false }] : [];
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

function makeInspectorTree(stores: InspectorStores, filterText: string): InspectorNode[] {
	const filter = filterText.trim().toLowerCase();
	const nodes: InspectorNode[] = [];

	if ('all store state'.includes(filter)) {
		nodes.push({
			id: ALL_STORE_STATE_ID,
			label: 'All Store State',
		});
	}

	const { root } = stores;
	if (root.label.toLowerCase().includes(filter)) nodes.push({ id: root.id, label: root.label });

	for (const group of stores.groups) {
		const groupMatches = group.label.toLowerCase().includes(filter);
		const children = group.children.filter(child => groupMatches || child.label.toLowerCase().includes(filter));
		if (groupMatches || children.length) nodes.push({ id: group.id, label: group.label, children: children.map(({ id, label }) => ({ id, label })) });
	}

	return nodes;
}

function makeStoreField(store: StoreLeaf): InspectorField {
	return {
		key: store.label,
		value: makeStoreSnapshot(store),
		editable: false,
	};
}

function makeAllStoreState(stores: InspectorStores): InspectorState {
	const state: InspectorState = {
		Root: [makeStoreField(stores.root)],
	};

	return stores.groups.reduce<InspectorState>((acc, group) => {
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
		state.State = [
			{
				key: 'state',
				value: unwrapInspectorValue(store.readState()),
				editable: false,
			},
		];
	}

	const getterFields = makeGetterFields(store.readGetters());
	if (getterFields.length) {
		state.Getters = getterFields;
	}

	return state;
}

function makeInspectorState(stores: InspectorStores, nodeId: string): InspectorState {
	if (nodeId === ALL_STORE_STATE_ID) {
		return makeAllStoreState(stores);
	}

	const group = stores.groups.find(candidate => candidate.id === nodeId);
	if (group) {
		return makeGroupState(group);
	}

	const store = stores.leaves.find(candidate => candidate.id === nodeId);
	if (store) {
		return makeLeafState(store);
	}

	return {};
}

function createRefreshScheduler(api: { sendInspectorTree(id: string): void; sendInspectorState(id: string): void }): (includeTree?: boolean) => void {
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

export function installStoreInspectorDevtools(app: App, results: ResultsState, corpus: Readonly<Ref<Corpus | undefined>>): void {
	const stores = inspectorStores(results, corpus);
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

				payload.rootNodes = makeInspectorTree(stores, payload.filter);
			});

			api.on.getInspectorState(payload => {
				if (payload.app !== app || payload.inspectorId !== STORE_INSPECTOR_ID) {
					return;
				}

				payload.state = makeInspectorState(stores, payload.nodeId);
			});

			stores.leaves.forEach(store => {
				watch(store.readState ?? store.readGetters, () => refreshInspector(), { deep: true });
			});

			refreshInspector(true);
		},
	);
}
