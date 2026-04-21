import { useLocalStorage } from '@vueuse/core';
import { ref } from 'vue';


export type LogCategory = 'history'|'parallel'|'init'|'shared'|'results';

const isDebugMode = import.meta.env.DEV;
const debug = useLocalStorage<boolean>('cf/debug', isDebugMode, { writeDefaults: false });
const debug_visible = ref(debug.value || !!DEBUG_INFO_VISIBLE);

let queued: any[][] = [];

// If you wish to see the original logging location, blackbox this script in the chrome devtools
// For now, seeing the original location is not supported in firefox and edge/ie (and probably safari)
export function debugLog(...args: any[]) {
	if (debug.value) {
		console.log(...args);
	} else {
		queued.push(args);
	}
}

/** Enable/disable categories of debug messages here, or add '*' to show everything */
const SHOW_DEBUG_CATEGORIES: null|Set<LogCategory> = null; // e.g. ['parallel', 'history'];

export function showDebugCat(category: LogCategory) {
	return !SHOW_DEBUG_CATEGORIES || SHOW_DEBUG_CATEGORIES.has(category);
}

/** A debug message in a category that we may want to show or not */
export function debugLogCat(category: LogCategory, ...args: any[]) {
	if (showDebugCat(category)) {
		debugLog(`[${category}]`, ...args);
	}
}

export function enable() {
	debug.value = true;
	for (const argArray of queued) {
		debugLog(...argArray);
	}
	queued = [];
}

export function disable() {
	debug.value = false;
}

export function show() {
	debug_visible.value = true;
}

export function hide() {
	debug_visible.value = false;
}

export default debug;
export { debug_visible };

// check in case of test environment
if (typeof window !== 'undefined')
	(window as any).debug = {
		enable,
		disable,
		show,
		hide,
	}