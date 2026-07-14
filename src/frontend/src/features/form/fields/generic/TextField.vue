<template>
	<div :id="htmlId" class="form-group">
		<label v-if="showLabel" class="control-label" :for="inputId">{{ resolvedDisplayName }} </label>
		<debug> [{{ id }}]</debug>

		<div :class="!variant.simple ? 'input-group' : ''">
			<Autocomplete
				v-if="autocomplete"
				data-width="100%"
				:data-class="['form-control', inputClass]"
				useQuoteAsWordBoundary
				:data-id="inputId"
				:data-name="inputId"
				:placeholder="placeholderText"
				:dir="textDirection"
				:getData="autocomplete"
				:disabled
				v-model="value"
			/>
			<input
				v-else
				:id="inputId"
				:class="['form-control', inputClass]"
				type="text"
				:placeholder="placeholderText"
				:dir="textDirection"
				:disabled
				:value
				@input="value = ($event.target as HTMLInputElement).value"
			/>

			<div v-if="!variant.simple" class="input-group-btn">
				<label :class="['btn', 'btn-default', 'file-input-button', btnClass, { disabled }]" :for="`${inputId}_file`">
					<span class="fa fa-upload fa-fw"></span>
					<input type="file" title="Upload a list of values" :id="`${inputId}_file`" @change="onFileChanged" :disabled />
				</label>
			</div>
		</div>

		<small v-if="resolvedDescription" class="help-block">{{ resolvedDescription }}</small>

		<div class="checkbox" :class="{ disabled }" v-if="caseSensitive">
			<label>
				<input type="checkbox" :checked="modelValue.caseSensitive" :disabled @change="updateCaseSensitive(($event.target as HTMLInputElement).checked)" />
				{{ $t(`widgets.caseSensitive`) }}
			</label>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { TextFieldState, TextFieldUiConfig } from './text-field';

import Autocomplete from '@/shared/ui/Autocomplete.vue';

const props = withDefaults(defineProps<ImplicitFieldComponentProps<TextFieldState> & TextFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
	disabled: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: TextFieldState];
}>();

const inputId = computed(() => `${props.htmlId}_value`);
const variant = computed(() => decodeVariants(props.variant));
const inputClass = computed(() => (variant.value.large ? 'input-lg' : variant.value.small ? 'input-sm' : ''));
const btnClass = computed(() => (variant.value.large ? 'btn-lg' : variant.value.small ? 'btn-sm' : ''));

const resolvedDisplayName = computed(() => toValue(props.displayName));
const resolvedDescription = computed(() => (props.description ? toValue(props.description) : undefined));
const placeholderText = computed(() => (props.placeholder && toValue(props.placeholder)) ?? resolvedDisplayName.value);
const textDirection = computed(() => props.textDirection ?? 'ltr');

const value = computed({
	get: () => props.modelValue.value,
	set: (nextValue: string) => emit('update:modelValue', { ...props.modelValue, value: nextValue }),
});

function updateCaseSensitive(caseSensitive: boolean) {
	emit('update:modelValue', {
		...props.modelValue,
		caseSensitive,
	});
}

function onFileChanged(event: Event) {
	const fileInput = event.target as HTMLInputElement;
	const file = fileInput.files && fileInput.files[0];
	if (file != null) {
		const fr = new FileReader();
		fr.onload = function () {
			// Replace all whitespace with pipes,
			// Same as the querybuilder wordlist upload
			value.value = (fr.result as string).trim().replace(/\s+/g, '|');
		};
		fr.readAsText(file);
	} else {
		value.value = '';
	}
	(event.target as HTMLInputElement).value = '';
}
</script>
