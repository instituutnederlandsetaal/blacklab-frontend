import { useLocalStorage } from '@vueuse/core';
import { computed, reactive, ref, type App, type ComputedRef, type Ref } from 'vue';

import useInjectable from '@/shared/utils/useInjectable';

type BuiltInLogCategory = 'article' | 'autocomplete' | 'export' | 'filter' | 'history' | 'init' | 'parallel' | 'query' | 'remote-index' | 'results' | 'shared' | 'store' | 'tooltip' | 'ui' | 'url';
export type LogCategory = BuiltInLogCategory | (string & {});

export type DebugSystemConfig = {
	enabledByDefault: boolean;
	visible: boolean;
};

type DebugSystem = {
	debug: Ref<boolean>;
	debug_visible: Ref<boolean>;
	knownCategories: ComputedRef<LogCategory[]>;
	activeCategories: Set<LogCategory>;
	debugLog(category: LogCategory, ...args: any[]): void;
	surfaceCategory(category: LogCategory): void;
	surfaceAllCategories(): void;
	enable(): void;
	disable(): void;
	show(): void;
	hide(): void;
};

const [_debugSystemKey, provideDebugSystem, useDebugSystem] = useInjectable<DebugSystem>('debugSystem');

const debug = useLocalStorage<boolean>('cf/debug', import.meta.env.DEV, { writeDefaults: false });
const debug_visible = ref(debug.value);
const pendingCategoryLogs: Array<{ category: LogCategory; args: any[] }> = [];
let currentDebugSystem: DebugSystem | null = null;

export function createDebugSystem(config: DebugSystemConfig) {
	if (config.enabledByDefault !== import.meta.env.DEV && (typeof localStorage === 'undefined' || localStorage.getItem('cf/debug') === null)) {
		debug.value = config.enabledByDefault;
	}
	debug_visible.value = debug.value || config.visible;

	const knownCategorySet = reactive(new Set<LogCategory>());
	const activeCategories = reactive(new Set<LogCategory>());
	const categoryLogs = new Map<LogCategory, any[][]>();
	const surfacedCategoryLogCounts = new Map<LogCategory, number>();

	/** Keep category discovery and its retained-log buffer initialized together. */
	function registerCategory(category: LogCategory) {
		knownCategorySet.add(category);
		if (!categoryLogs.has(category)) categoryLogs.set(category, []);
	}

	function debugLog(category: LogCategory, ...args: any[]) {
		registerCategory(category);
		const logArgs = [`[${category}]`, ...args];
		const entries = categoryLogs.get(category)!;
		entries.push(logArgs);
		if (activeCategories.has(category)) {
			console.debug(...logArgs);
			surfacedCategoryLogCounts.set(category, entries.length);
		}
	}

	function surfaceCategory(category: LogCategory) {
		registerCategory(category);
		activeCategories.add(category);

		const entries = categoryLogs.get(category)!;
		const firstUnsurfaced = surfacedCategoryLogCounts.get(category) ?? 0;
		for (const entry of entries.slice(firstUnsurfaced)) {
			console.debug(...entry);
		}
		surfacedCategoryLogCounts.set(category, entries.length);
	}

	const context: DebugSystem = {
		debug,
		debug_visible,
		knownCategories: computed(() => [...knownCategorySet].sort((a, b) => a.localeCompare(b))),
		activeCategories,
		debugLog,
		surfaceCategory,
		surfaceAllCategories() {
			for (const category of knownCategorySet) surfaceCategory(category);
		},
		enable: () => (debug.value = true),
		disable: () => (debug.value = false),
		show: () => (debug_visible.value = true),
		hide: () => (debug_visible.value = false),
	};

	currentDebugSystem = context;
	for (const entry of pendingCategoryLogs.splice(0)) debugLog(entry.category, ...entry.args);

	if (typeof window !== 'undefined')
		(window as any).debug = {
			enable: () => context.enable(),
			disable: () => context.disable(),
			show: () => context.show(),
			hide: () => context.hide(),
			surfaceCategory: (category: LogCategory) => context.surfaceCategory(category),
			surfaceAllCategories: () => context.surfaceAllCategories(),
		};

	return {
		...context,
		install(app: App) {
			provideDebugSystem(app, context);
		},
	};
}

export function debugLog(category: LogCategory, ...args: any[]) {
	if (currentDebugSystem) {
		currentDebugSystem.debugLog(category, ...args);
	} else {
		pendingCategoryLogs.push({ category, args });
	}
}

export default debug;
export { useDebugSystem };
