<template>
	<slot v-if="loadableContent.isLoading()" name="loading">
		<Spinner v-if="loadableContent.isLoading()" />
	</slot>
	<slot v-else-if="loadableContent.isError()" name="error" :error="loadableContent.error">
		<div class="text-danger">
			{{ loadableContent.error.message }}
		</div>
	</slot>
	<div v-else-if="loadableContent.isLoaded()" ref="contentContainer"></div>
	<slot v-else name="empty"></slot>
</template>

<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue';

import { Loadable } from '@/shared/utils/loadable/loadable';

import Spinner from './Spinner.vue';

type RenderableContent = string | HTMLElement | null | undefined;
type Content = Loadable<RenderableContent> | RenderableContent;

defineOptions({
	name: 'HtmlRenderer',
});

const props = withDefaults(
	defineProps<{
		content: Content;
		executeScripts?: boolean;
		parseStringAsHtml?: boolean;
	}>(),
	{
		executeScripts: false,
		parseStringAsHtml: false,
	},
);

const loadableContent = computed<Loadable<RenderableContent>>(() => Loadable.wrap(props.content));

const contentContainer = useTemplateRef<HTMLDivElement>('contentContainer');

function runScriptElements(container: HTMLElement) {
	container.querySelectorAll('script').forEach(script => {
		const replacement = document.createElement('script');

		Array.from(script.attributes).forEach(attribute => replacement.setAttribute(attribute.name, attribute.value));
		replacement.text = script.textContent ?? '';

		if (!replacement.hasAttribute('async')) replacement.async = false;

		script.replaceWith(replacement);
	});
}

function renderContent(container: HTMLElement, value: RenderableContent) {
	if (value instanceof HTMLElement) container.replaceChildren(value);
	else if (typeof value === 'string' && props.parseStringAsHtml) container.innerHTML = value;
	else if (typeof value === 'string') container.replaceChildren(value);
	else container.replaceChildren();

	if (props.executeScripts) runScriptElements(container);
}

let nonce = 0;
watch(
	() => [loadableContent.value, props.executeScripts, props.parseStringAsHtml] as const,
	async ([state]) => {
		const version = ++nonce;
		await nextTick();

		if (version !== nonce || !loadableContent.value.isLoaded() || !contentContainer.value) return;

		renderContent(contentContainer.value, loadableContent.value.value);
	},
	{ immediate: true },
);
</script>
