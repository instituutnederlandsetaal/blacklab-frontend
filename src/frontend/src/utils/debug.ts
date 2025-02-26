import Vue from 'vue';
import { syncPropertyWithLocalStorage } from '@/utils/localstore';


export type LogCategory = 'history'|'parallel'|'init'|'shared';

const isDebugMode = !!process.env.NODE_ENV?.match(/dev|test/);
let debug = Vue.observable({
	debug: isDebugMode,
	debug_visible: typeof DEBUG_INFO_VISIBLE !== 'undefined' ? DEBUG_INFO_VISIBLE ?? isDebugMode : isDebugMode
});

let queued: IArguments[] = [];

// If you wish to see the original logging location, blackbox this script in the chrome devtools
// For now, seeing the original location is not supported in firefox and edge/ie (and probably safari)
export function debugLog(...args: any[]) {
	if (debug.debug) {
		console.log.apply(console, arguments); //tslint:disable-line
	} else {
		queued.push(arguments);
	}
}

/** Enable/disable categories of debug messages here, or add '*' to show everything */
const SHOW_DEBUG_CATEGORIES: null|Set<LogCategory> = null; // e.g. ['parallel', 'history'];

export function showDebugCat(category: LogCategory) {
	return !SHOW_DEBUG_CATEGORIES || SHOW_DEBUG_CATEGORIES.has(category);
}

/** A debug message in a category that we may want to show or not */
export function debugLogCat(category: string, ...args: any[]) {
	if (showDebugCat(category)) {
		debugLog(`[${category}]`, ...args);
	}
}

export function enable() {
	debug.debug = true;
	for (const argArray of queued) {
		debugLog.apply(undefined, argArray);
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

export function monitorRedraws() {
	const style = document.createElement('style');
	style.textContent = `
	@keyframes flash {
		0% { outline: 1px solid rgba(255,0,0,1); }
		99% { outline: 1px solid rgba(255,0,0,0); }
		100% { outline: none; }
	}

	* {
		animation: flash 1s;
	}
	`;

	document.body.appendChild(style);

	const stopAnimationListener = function(this: HTMLElement) {
		this.style.animationPlayState = 'paused';
		this.onanimationend = null;
	};

	const observer = new MutationObserver((mutations, ob) => {
		mutations.forEach(mutation => {

			const targets = [] as HTMLElement[];
			switch (mutation.type) {
				case 'characterData': targets.push(mutation.target.parentElement!); break;
				case 'attributes': {
					if (mutation.attributeName !== 'style' && mutation.target) {
						targets.push(mutation.target as HTMLElement);
					}
					break;
				}
				case 'childList': mutation.addedNodes.length > 0 ? targets.push(mutation.addedNodes.item(0)!.parentElement!) : targets.push(mutation.removedNodes.item(0)!.parentElement!); break;
			}

			window.requestAnimationFrame(() => {
				targets.forEach(t => {
					t.style.animation = 'none';
				});
				window.requestAnimationFrame(() => targets.forEach(t => {
					t.style.animation = 'flash 1s';
					t.onanimationend = stopAnimationListener;
				}));
			});
		});
	});

	observer.observe(document, {
		attributes: true,
		characterData: true,
		childList: true,
		subtree: true
	});
}

// only bind to localstorage if not running in development environment (as debug mode is always enabled when running from webpack)
if (process.env.NODE_ENV !== 'development' && typeof localStorage !== 'undefined') {
	syncPropertyWithLocalStorage('cf/debug', debug, 'debug');
}

export default debug;

// check in case of test environment
if (typeof window !== 'undefined')
	(window as any).debug = {
		enable,
		disable,
		show,
		hide,
		monitorRedraws,
	}