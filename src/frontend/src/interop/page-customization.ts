import { onScopeDispose, readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

import type { CFCustomCssEntry, CFCustomJsEntry } from '@/types/apptypes';

const cssElementMarker = 'data-page-customization-css';
const jsElementMarker = 'data-page-customization-js';
export const customCssChangedEvent = 'page-customization-css-changed';
export const customJsDisposeEvent = 'page-customization-js-dispose';
const pendingCssLoadHandlers = new WeakMap<HTMLLinkElement, () => void>();

function disposeCustomJs(script: HTMLScriptElement): void {
	script.dispatchEvent(new Event(customJsDisposeEvent));
	script.remove();
}

/** Publish the single compatibility event used after customized styles settle or disappear. */
function notifyCustomCssChanged() {
	window.dispatchEvent(new Event(customCssChangedEvent));
}

function stopWaitingForCss(link: HTMLLinkElement) {
	const handler = pendingCssLoadHandlers.get(link);
	if (!handler) return;
	link.removeEventListener('load', handler);
	link.removeEventListener('error', handler);
	pendingCssLoadHandlers.delete(link);
}

function _useInsertableContent<T>(p: { insert: (content: T[]) => void; remove: () => void; content: MaybeRefOrGetter<T[]>; immediate?: boolean }) {
	const enabled = ref(p.immediate ?? true);
	watch(
		[enabled, () => toValue(p.content)],
		([enabled, content]) => {
			p.remove();
			if (enabled) p.insert(content);
		},
		{ immediate: true },
	);

	onScopeDispose(p.remove);

	return {
		enable: () => (enabled.value = true),
		disable: () => (enabled.value = false),
		toggle: () => (enabled.value = !enabled.value),
		isEnabled: readonly(enabled),
	};
}

export const useCustomCss = (css: MaybeRefOrGetter<CFCustomCssEntry[]>, options?: { immediate: boolean }) => {
	return _useInsertableContent({
		content: css,
		immediate: options?.immediate,
		insert: cssEntries => {
			let remaining = cssEntries.length;
			cssEntries.forEach(css => {
				const link = document.createElement('link');
				Object.entries(css.attributes).forEach(([k, v]) => v && link.setAttribute(k, v.toString()));
				link.setAttribute(cssElementMarker, '');
				const handleSettled = () => {
					stopWaitingForCss(link);
					if (--remaining === 0) notifyCustomCssChanged();
				};
				pendingCssLoadHandlers.set(link, handleSettled);
				link.addEventListener('load', handleSettled);
				link.addEventListener('error', handleSettled);
				document?.head?.appendChild(link);
			});
		},
		remove: () => {
			const links = document?.head?.querySelectorAll?.<HTMLLinkElement>(`link[${cssElementMarker}]`);
			if (!links?.length) return;
			links.forEach(link => {
				stopWaitingForCss(link);
				link.remove();
			});
			notifyCustomCssChanged();
		},
	});
};

export const useCustomJs = (js: MaybeRefOrGetter<CFCustomJsEntry[]>, options?: { immediate: boolean }) => {
	return _useInsertableContent({
		content: js,
		immediate: options?.immediate,
		insert: jsEntries => {
			jsEntries.forEach(js => {
				const script = document.createElement('script');
				Object.entries(js.attributes).forEach(([k, v]) => v && script.setAttribute(k, v.toString()));
				if (!script.hasAttribute('async')) script.async = false;
				script.setAttribute(jsElementMarker, '');
				document?.body?.appendChild(script);
			});
		},
		remove: () => document?.body?.querySelectorAll?.<HTMLScriptElement>(`script[${jsElementMarker}]`)?.forEach(disposeCustomJs),
	});
};

export { useFavicon, useTitle } from '@vueuse/core';
