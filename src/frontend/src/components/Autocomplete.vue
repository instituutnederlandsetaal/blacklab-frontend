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

import { computed, ref, useTemplateRef } from 'vue';
import SelectPicker from './SelectPicker.vue';

void SelectPicker;

import { splitIntoTerms } from '@/utils';
import type { Option } from '@/utils/options';

const modelValue = defineModel<string>({default: ''});
const props = withDefaults(defineProps<{
	getData: (term: string) => Promise<string[]>,
	autocomplete?: boolean,
	useQuoteAsWordBoundary?: boolean,
}>(), {
	autocomplete: true,
	useQuoteAsWordBoundary: false,
});

const emit = defineEmits<{
   change: [value: string],
   update: [value: string] 
}>()


const options = ref<string[]>([]);
const autocompleteRef = useTemplateRef<typeof SelectPicker>('input');
const inputElement = computed<HTMLInputElement | null>(() => {
	console.log('getting input element');
	const el = autocompleteRef.value?.$el;
	if (!el) {
		// console.warn(`Could not find 'input' template ref`);
		return null;
	}
	const input = el.querySelector('input');
	if (!input) {
		// console.warn(`Could not find input element within autocomplete component`);
		return null;
	}
	if (!(input instanceof HTMLInputElement)) {
		// console.warn(`Element found with querySelector was not an HTMLInputElement`);
		return null;
	} 
	return input;
});

let lastSearchValue = '';

function _refreshList() {
	// console.log('refreshing list');
	if (!props.getData) return;
	
	const input = inputElement.value;
	if (!input) return;
	
	const v = _getWordAroundCursor(input, false).value;
	if (v === lastSearchValue) return;
	
	lastSearchValue = v;
	if (!v.length) return;

	let r: Promise<string[]> = props.getData(v);
	if (!r) return;
	r.then(suggestions => {
		if (v === lastSearchValue) options.value = suggestions;
	});
}

/**
 * @param lookForward select until next whitespace, or only look back
 */
function _getWordAroundCursor(inputElement: HTMLInputElement, lookForward: boolean): {start: number, end: number, value: string} {
	const input = inputElement;
	const value = input.value;
	const nothingFound = {value : '', start: 0, end: value.length};
	if (value.length > 100) {
		return nothingFound;
	}

	let start = input.selectionStart != null ? input.selectionStart : 0;
	let end = input.selectionEnd != null ? input.selectionEnd : value.length;
	if (start > end) { const tmp = start; start = end; end = tmp; }

	if (start === end) { // just a caret; no selection, find whitespace boundaries around cursor
		// start - 1 because splitIntoTerms takes quotes into consideration by default, but we do not.
		const term =  splitIntoTerms(value, props.useQuoteAsWordBoundary).find(t => t.end >= (start -1))
		if (!term) {
			return nothingFound;
		}
		if (lookForward) {
			return term;
		}
		// We have a term but aren't supposed to look beyond the cursor end index, strip everything beyond it from the found term.
		return {
			start: term.isQuoted ? term.start + 1 : term.start,
			end: Math.min(term.end, end),
			value: term.value.substring(0, end - term.start)
		}
	}

	return { start, end, value: value.substring(start, end) };
}
function _autocompleteSelected({value: v}: Option) {
	if (props.useQuoteAsWordBoundary && v.match(/\s/)) v = `"${v}"`;

	const input = inputElement.value;
	if (!input) return;
	const value = input.value;

	const {start, end}: {start: number; end: number;} = _getWordAroundCursor(input, true);

	input.value = value.substring(0, start) + v + value.substring(end);
	input.selectionStart = start+v.length+1;
	input.selectionEnd = start+v.length+1;

	input.dispatchEvent(new Event('input'));
	return false;
}	
</script>
