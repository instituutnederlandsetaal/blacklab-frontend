<template>
	<SelectPicker
		v-bind="$attrs"
		editable
		:onBeforeSelect="_autocompleteSelected"
		v-model="modelValue"
		:options
		:autocomplete="props.autocomplete ? 'on' : 'off'"
		container="body"
		@keyup="_refreshList"
		ref="input"
	>
		<!-- pass through all slots -->
		<template v-for="(_, slotName) in $slots" v-slot:[slotName]="slotProps">
			<slot :name="slotName" v-bind="slotProps ?? {}" />
		</template>
	</SelectPicker>
</template>

<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';

import { useRequestResource, type RequestLike } from '@/shared/utils/loadable/loadable-request-resource';
import type { Option } from '@/shared/utils/options';
import { tokenizeString } from '@/shared/utils/string-utils';

import SelectPicker from './SelectPicker.vue';

const modelValue = defineModel<string>({ default: '' });
const props = withDefaults(
	defineProps<{
		getData: (term: string) => RequestLike<string[]>;
		autocomplete?: boolean;
		useQuoteAsWordBoundary?: boolean;
	}>(),
	{
		autocomplete: true,
		useQuoteAsWordBoundary: false,
	},
);

const emit = defineEmits<{
	change: [value: string];
	update: [value: string];
}>();

const autocompleteRef = useTemplateRef<typeof SelectPicker>('input');
const inputElement = computed(() => (autocompleteRef.value?.$el as HTMLElement | undefined)?.querySelector<HTMLInputElement>('input') ?? null);
const request = useRequestResource<string, string[]>({ mode: 'manual', request: term => props.getData(term) });
const options = computed(() => (request.state.value.phase === 'loaded' ? request.state.value.data : []));

let lastSearchValue = '';

function _refreshList() {
	const input = inputElement.value;
	if (!input) return;

	const v = _getWordAroundCursor(input, false).value;
	if (v === lastSearchValue && (request.state.value.phase === 'loading' || request.state.value.phase === 'loaded')) return;

	lastSearchValue = v;
	if (v) request.run(v);
	else request.reset();
}

/**
 * @param lookForward select until next whitespace, or only look back
 */
function _getWordAroundCursor(inputElement: HTMLInputElement, lookForward: boolean): { start: number; end: number; value: string } {
	const value = inputElement.value;
	let start = inputElement.selectionStart ?? 0;
	let end = inputElement.selectionEnd ?? value.length;
	if (start > end) [start, end] = [end, start];
	const nothingFound = { value: '', start, end };
	if (value.length > 100) return nothingFound;

	if (start === end) {
		if (start > 0 && /\s/.test(value[start - 1])) return nothingFound;
		const term = tokenizeString(value, props.useQuoteAsWordBoundary).find(t => t.start <= start && t.end >= start);
		if (!term) return nothingFound;
		if (lookForward) return term;
		const contentStart = term.start + (term.isQuoted ? 1 : 0);
		return {
			start: contentStart,
			end,
			value: tokenizeString(value.substring(term.start, end), props.useQuoteAsWordBoundary)[0]?.value ?? '',
		};
	}

	return { start, end, value: value.substring(start, end) };
}
function _autocompleteSelected({ value: v }: Option) {
	if (props.useQuoteAsWordBoundary && v.match(/\s/)) v = `"${v}"`;

	const input = inputElement.value;
	if (!input) return false;
	const { start, end } = _getWordAroundCursor(input, true);
	input.setRangeText(v, start, end, 'end');
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return false;
}
</script>
