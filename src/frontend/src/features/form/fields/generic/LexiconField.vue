<template>
	<div v-bind="field.rootAttrs">
		<label v-if="showLabel" :class="['control-label', field.labelClass]" :for="field.inputId">
			{{ displayName }}
			<Debug> [{{ id }}]</Debug>
		</label>
		<Debug v-else>
			<label :class="['control-label', field.labelClass]">[{{ id }}]</label>
		</Debug>

		<div :class="field.controlsClass">
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
});
const emit = defineEmits<{
	'update:modelValue': [value: TextFieldState];
}>();

const wordOptions = ref<LexiconWordOption[] | null>([]);
const posOptions = ref<Record<string, boolean>>({});
let generatedValue: string | undefined;

const field = useFieldPresentation(props);

const renderedWords = computed(() => (wordOptions.value ? wordOptions.value.filter(word => word.pos.some(pos => posOptions.value[pos])) : []));
const selectedWords = computed(() => renderedWords.value.filter(word => word.selected));
const value = computed({
	get: () => props.modelValue.value,
	set: (nextValue: string) => emit('update:modelValue', { ...props.modelValue, value: nextValue }),
});

const isValidWord = /^[\w]+$/;

function selectAll() {
	renderedWords.value.forEach(word => (word.selected = word.count > 0));
}

function deselectAll() {
	renderedWords.value.forEach(word => (word.selected = false));
}

watch(
	() => value.value,
	(nextValue, _, onCleanup) => {
		const suppressLookup = nextValue === generatedValue;
		generatedValue = undefined;
		if (suppressLookup) return;

		if (!nextValue || !isValidWord.test(nextValue)) {
			posOptions.value = {};
			wordOptions.value = [];
			return;
		}

		let active = true;
		const timer = setTimeout(() => {
			props
				.lookup(nextValue)
				.catch(() => defaultLexiconLookupResult)
				.then(result => {
					if (!active) return;
					posOptions.value = { ...result.posOptions };
					wordOptions.value = result.wordList.map(word => ({ ...word, pos: [...word.pos] }));
				});
		}, 1500);
		onCleanup(() => {
			active = false;
			clearTimeout(timer);
		});
		wordOptions.value = null;
		posOptions.value = {};
	},
);

watch(
	() => selectedWords.value.length,
	() => {
		if (wordOptions.value?.length) {
			generatedValue = selectedWords.value
				.map(word => word.word.replace(/([|*?])/g, '\\$1'))
				.map(word => (word.includes(' ') ? `"${word}"` : word))
				.join('|');
			value.value = generatedValue;
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
