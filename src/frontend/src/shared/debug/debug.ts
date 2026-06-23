import { useLocalStorage } from '@vueuse/core';
import { computed, reactive, ref, type App, type ComputedRef, type Ref } from 'vue';

import useInjectable from '@/shared/utils/useInjectable';

export type BuiltInLogCategory =
	| 'article'
	| 'autocomplete'
	| 'export'
	| 'filter'
	| 'history'
	| 'init'
	| 'parallel'
	| 'query'
	| 'remote-index'
	| 'results'
	| 'shared'
	| 'store'
	| 'tooltip'
	| 'ui'
	| 'url';
export type LogCategory = BuiltInLogCategory | (string & {});

export type DebugSystemConfig = {
	enabledByDefault: boolean;
	visible: boolean;
};

export type DebugSystem = {
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

function logToConsole(args: any[]) {
	console.debug(...args);
}

export function createDebugSystem(config: DebugSystemConfig) {
	if (config.enabledByDefault !== import.meta.env.DEV && (typeof localStorage === 'undefined' || localStorage.getItem('cf/debug') === null)) {
		debug.value = config.enabledByDefault;
	}
	debug_visible.value = debug.value || config.visible;

	const knownCategorySet = reactive(new Set<LogCategory>());
	const activeCategories = reactive(new Set<LogCategory>());
	const categoryLogs = new Map<LogCategory, any[][]>();
	const surfacedCategoryLogCounts = new Map<LogCategory, number>();

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
			logToConsole(logArgs);
			surfacedCategoryLogCounts.set(category, entries.length);
		}
	}

	function surfaceCategory(category: LogCategory) {
		registerCategory(category);
		activeCategories.add(category);

		const entries = categoryLogs.get(category)!;
		const firstUnsurfaced = surfacedCategoryLogCounts.get(category) ?? 0;
		for (const entry of entries.slice(firstUnsurfaced)) {
			logToConsole(entry);
		}
		surfacedCategoryLogCounts.set(category, entries.length);
	}

	function surfaceAllCategories() {
		for (const category of knownCategorySet) surfaceCategory(category);
	}

	function enable() {
		debug.value = true;
	}

	function disable() {
		debug.value = false;
	}

	function show() {
		debug_visible.value = true;
	}

	function hide() {
		debug_visible.value = false;
	}

	const context: DebugSystem = {
		debug,
		debug_visible,
		knownCategories: computed(() => [...knownCategorySet].sort((a, b) => a.localeCompare(b))),
		activeCategories,
		debugLog,
		surfaceCategory,
		surfaceAllCategories,
		enable,
		disable,
		show,
		hide,
	};

	currentDebugSystem = context;
	for (const entry of pendingCategoryLogs.splice(0)) debugLog(entry.category, ...entry.args);

	if (typeof window !== 'undefined')
		(window as any).debug = {
			enable,
			disable,
			show,
			hide,
			surfaceCategory,
			surfaceAllCategories,
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

export function enable() {
	currentDebugSystem?.enable();
}

export function disable() {
	currentDebugSystem?.disable();
}

export function show() {
	currentDebugSystem?.show();
}

export function hide() {
	currentDebugSystem?.hide();
}

export default debug;
export { debug_visible, useDebugSystem };
