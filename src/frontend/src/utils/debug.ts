import { syncPropertyWithLocalStorage } from '@/utils/localstore';
import { reactive } from 'vue';


export type LogCategory = 'history'|'parallel'|'init'|'shared'|'results';

const isDebugMode = import.meta.env.DEV;
let debug = reactive({
	debug: false,
	debug_visible: isDebugMode || (typeof DEBUG_INFO_VISIBLE !== 'undefined' ? DEBUG_INFO_VISIBLE : false),
});
syncPropertyWithLocalStorage('cf/debug', debug, 'debug');

let queued: any[][] = [];

// If you wish to see the original logging location, blackbox this script in the chrome devtools
// For now, seeing the original location is not supported in firefox and edge/ie (and probably safari)
export function debugLog(...args: any[]) {
	if (debug.debug) {
		console.log(...args);
	} else {
		queued.push(args);
	}
}

/** Enable/disable categories of debug messages here, or add '*' to show everything */
const SHOW_DEBUG_CATEGORIES: null|Set<LogCategory> = new Set(); // e.g. ['parallel', 'history'];

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
	debug.debug = true;
	for (const argArray of queued) {
		debugLog(...argArray);
	}
	queued = [];
}

export function disable() {
	debug.debug = false;
}

export function show() {
	debug.debug_visible = true;
}

export function hide() {
	debug.debug_visible = false;
}

export default debug;

// check in case of test environment
if (typeof window !== 'undefined')
	(window as any).debug = {
		enable,
		disable,
		show,
		hide,
	}