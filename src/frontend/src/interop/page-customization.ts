import { onScopeDispose, readonly, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

import type { CFCustomCssEntry, CFCustomJsEntry } from '@/types/apptypes';

export type HeadElementDefinition = {
	tagName: 'link' | 'meta';
	attributes: Record<string, string>;
};

const cssElementMarker = 'data-page-customization-css';
const jsElementMarker = 'data-page-customization-js';
const headElementMarker = 'data-page-customization-head';

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
			cssEntries.forEach(css => {
				const link = document.createElement('link');
				Object.entries(css.attributes).forEach(([k, v]) => v && link.setAttribute(k, v.toString()));
				link.setAttribute(cssElementMarker, '');
				document?.head?.appendChild(link);
			});
		},
		remove: () => document?.head?.querySelectorAll?.(`link[${cssElementMarker}]`)?.forEach(e => e.remove()),
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
