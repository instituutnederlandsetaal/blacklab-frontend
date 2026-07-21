import { onScopeDispose, readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

import type { CFCustomCssEntry, CFCustomJsEntry } from '@/types/apptypes';

export type HeadElementDefinition = {
	tagName: 'link' | 'meta';
	attributes: Record<string, string>;
};

const cssElementMarker = 'data-page-customization-css';
const jsElementMarker = 'data-page-customization-js';
const headElementMarker = 'data-page-customization-head';
export const customCssChangedEvent = 'page-customization-css-changed';
const pendingCssLoadHandlers = new WeakMap<HTMLLinkElement, () => void>();

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
		() => toValue(p.content),
		content => {
			if (!enabled.value) return;
			p.remove();
			p.insert(content);
		},
	);
	watch(enabled, enabled => {
		if (!enabled) p.remove();
		else p.insert(toValue(p.content));
	});

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
		remove: () => document?.body?.querySelectorAll?.(`script[${jsElementMarker}]`)?.forEach(e => e.remove()),
	});
};

export const useHeadElements = (elements: MaybeRefOrGetter<HeadElementDefinition[]>, options?: { immediate: boolean }) => {
	return _useInsertableContent({
		content: elements,
		immediate: options?.immediate,
		insert: entries => {
			entries.forEach(({ tagName, attributes }) => {
				const element = document.createElement(tagName);
				Object.entries(attributes).forEach(([key, value]) => value && element.setAttribute(key, value));
				element.setAttribute(headElementMarker, '');
				document?.head?.appendChild(element);
			});
		},
		remove: () => document?.head?.querySelectorAll?.(`[${headElementMarker}]`)?.forEach(e => e.remove()),
	});
};

export { useFavicon, useTitle } from '@vueuse/core';
