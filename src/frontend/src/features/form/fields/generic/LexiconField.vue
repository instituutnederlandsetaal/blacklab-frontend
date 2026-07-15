<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" class="control-label" :for="field.inputId">{{ displayName }} </label>
		<debug> [{{ id }}]</debug>

		<div class="lexicon">
			<div class="lexicon-input">
				<input
					type="text"
					:class="['form-control', field.inputClass, { loading: wordOptions === null }]"
					autocomplete="off"
					:id="field.inputId"
					:name="field.inputId"
					:placeholder="placeholder || displayName"
					:dir="textDirection || 'ltr'"
					:disabled
					:value="value"
					@input="value = ($event.target as HTMLInputElement).value"
				/>
				<Spinner v-if="wordOptions === null" overlay right inverted :size="field.variants.large ? 32 : 22" class="lexicon-spinner" />
			</div>

			<div v-if="wordOptions && wordOptions.length" style="display: flex; flex-wrap: wrap; gap: 0.25em; margin: 10px 0">
				<button type="button" :class="['btn', 'btn-default', field.buttonClass]" :disabled="disabled || selectedWords.length === renderedWords.length" @click="selectAll">
					{{ $t('lexicon.selectAll') }}
				</button>
				<button type="button" :class="['btn', 'btn-default', field.buttonClass]" :disabled="disabled || !selectedWords.length" @click="deselectAll">{{ $t('lexicon.deselectAll') }}</button>
			</div>

			<div style="max-height: 400px; overflow-y: auto; overflow-x: hidden">
				<label
					v-for="opt in renderedWords"
					:key="opt.word"
					style="width: 10vw; min-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
					:role="opt.count > 0 && !disabled ? 'button' : undefined"
					:class="{ disabled: disabled || opt.count === 0 }"
					:title="`${opt.word} (${opt.count})`"
				>
					<input type="checkbox" :disabled="disabled || opt.count === 0" v-model="opt.selected" /> {{ opt.word }}
				</label>
			</div>
			<template v-if="wordOptions && wordOptions.length">
				<h4>{{ $t('lexicon.limit') }}</h4>
				<div style="max-height: 400px; overflow-y: auto; overflow-x: hidden">
					<label
						v-for="(_checked, pos) in posOptions"
						:key="pos"
						style="width: 10vw; min-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
						:role="!disabled ? 'button' : undefined"
					>
						<input type="checkbox" v-model="posOptions[pos]" :value="pos" :disabled /> {{ pos }}
					</label>
				</div>
			</template>
		</div>

		<small v-if="description" class="help-block">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import { defaultLexiconLookupResult, type LexiconFieldComponentProps, type LexiconWordOption } from './lexicon-field';
import type { TextFieldState } from './text-field';

import Spinner from '@/shared/ui/Spinner.vue';

const props = withDefaults(defineProps<LexiconFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: TextFieldState];
}>();

const wordOptions = ref<LexiconWordOption[] | null>([]);
const posOptions = ref<Record<string, boolean>>({});
const requestSerial = ref(0);
const suppressNextValueLookup = ref(false);
let debounceHandle: ReturnType<typeof setTimeout> | undefined;

const field = useFieldPresentation(props);

const renderedWords = computed(() => (wordOptions.value ? wordOptions.value.filter(word => word.pos.some(pos => posOptions.value[pos])) : []));
const selectedWords = computed(() => renderedWords.value.filter(word => word.selected));
const value = computed({
	get: () => props.modelValue.value,
	set: (nextValue: string) => emit('update:modelValue', { ...props.modelValue, value: nextValue }),
});

const isValidWord = /^[\w]+$/;

function applyLookupResult(serial: number, result = defaultLexiconLookupResult) {
	if (serial !== requestSerial.value) return;
	posOptions.value = { ...result.posOptions };
	wordOptions.value = result.wordList.map(word => ({ ...word, pos: [...word.pos] }));
}

function selectAll() {
	renderedWords.value.forEach(word => (word.selected = word.count > 0));
}

function deselectAll() {
	renderedWords.value.forEach(word => (word.selected = false));
}

function escapeLexiconTerm(term: string) {
	return term.replace(/([|*?])/g, '\\$1');
}

watch(
	() => value.value,
	nextValue => {
		if (debounceHandle) clearTimeout(debounceHandle);
		if (suppressNextValueLookup.value) {
			suppressNextValueLookup.value = false;
			return;
		}

		const serial = ++requestSerial.value;
		if (!nextValue) {
			applyLookupResult(serial);
			return;
		}

		if (!nextValue.match(isValidWord)) {
			applyLookupResult(serial);
			return;
		}

		wordOptions.value = null;
		posOptions.value = {};
		debounceHandle = setTimeout(() => {
			props.lookup(nextValue).then(
				result => applyLookupResult(serial, result),
				() => applyLookupResult(serial),
			);
		}, 1500);
	},
);

watch(
	() => selectedWords.value.length,
	(nextLength, previousLength) => {
		if (nextLength !== previousLength && wordOptions.value && wordOptions.value.length > 0) {
			suppressNextValueLookup.value = true;
			value.value = selectedWords.value
				.map(word => escapeLexiconTerm(word.word))
				.map(word => (word.includes(' ') ? `"${word}"` : word))
				.join('|');
		}
	},
);

watch(
	posOptions,
	(current, previous) => {
		if (Object.entries(previous).length) {
			renderedWords.value.forEach(word => (word.selected = word.pos.some(pos => current[pos])));
		}
	},
	{ deep: true },
);
</script>

<style lang="scss" scoped>
.lexicon {
	position: relative;
}

.lexicon-input {
	position: relative;
}

label[disabled],
label.disabled {
	opacity: 0.5;
	cursor: not-allowed;
	input {
		opacity: 1;
	}
}

.lexicon-spinner {
	pointer-events: none;
}

.form-control.loading {
	text-overflow: ellipsis;
	padding-right: 2.5em;
}
</style>
