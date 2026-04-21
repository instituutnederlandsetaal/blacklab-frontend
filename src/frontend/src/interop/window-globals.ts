import type { App } from 'vue';

export function setMountedVueGlobals(app: App, root: unknown) {
	(window as any).vueApp = app;
	(window as any).vueRoot = root;
}

export function setCurrentCorpusDataGlobal(value: unknown) {
	(globalThis as any).currentCorpusData = value;
}