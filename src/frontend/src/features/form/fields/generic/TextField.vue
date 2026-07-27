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
			<div :class="!field.variants.simple ? 'input-group' : ''">
				<Autocomplete
					v-if="autocomplete"
					data-width="100%"
					:data-class="['form-control', field.inputClass]"
					useQuoteAsWordBoundary
					:data-id="field.inputId"
					:data-name="field.inputId"
					:placeholder="placeholder || displayName"
					:dir="textDirection || 'ltr'"
					:getData="autocomplete"
					:disabled
					v-model="value"
				/>
				<input
					v-else
					:id="field.inputId"
					:class="['form-control', field.inputClass]"
					type="text"
					:placeholder="placeholder || displayName"
					:dir="textDirection || 'ltr'"
					:disabled
					:value
					@input="value = ($event.target as HTMLInputElement).value"
				/>

				<div v-if="!field.variants.simple" class="input-group-btn">
					<label :class="['btn', 'btn-default', 'file-input-button', field.buttonClass, { disabled }]" :for="`${field.inputId}_file`">
						<span class="fa fa-upload fa-fw"></span>
						<input type="file" title="Upload a list of values" :id="`${field.inputId}_file`" @change="onFileChanged" :disabled />
					</label>
				</div>
			</div>

			<small v-if="description" class="help-block">{{ description }}</small>

			<div class="checkbox" :class="{ disabled }" v-if="caseSensitive && !field.variants.simple">
				<label>
					<input type="checkbox" :checked="modelValue.caseSensitive" :disabled @change="updateCaseSensitive(($event.target as HTMLInputElement).checked)" />
					{{ $t(`widgets.caseSensitive`) }}
				</label>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '../field-presentation';
import type { TextFieldComponentProps, TextFieldState } from './text-field';

import Autocomplete from '@/shared/ui/Autocomplete.vue';

const props = withDefaults(defineProps<TextFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: TextFieldState];
}>();

const field = useFieldPresentation(props);

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
