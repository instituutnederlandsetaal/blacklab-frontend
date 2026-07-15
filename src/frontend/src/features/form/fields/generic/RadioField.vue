<template>
	<div v-bind="field.rootAttrs">
		<fieldset>
			<legend v-if="showLabel">
				{{ displayName }}<debug> [{{ id }}]</debug>
			</legend>
			<div v-for="(option, index) in options" :key="index" class="radio">
				<label :for="`${field.inputId}_${index}`" :title="option.title || ''">
					<input
						type="radio"
						:value="option.value"
						:name="field.inputId"
						:id="`${field.inputId}_${index}`"
						:checked="modelValue === option.value"
						:disabled
						@click="changeValue($event, option.value)"
						@input.space="changeValue($event, option.value)"
					/>
					{{ option.label || option.value }}
				</label>
			</div>
		</fieldset>
		<small v-if="description" class="help-block">{{ description }}</small>
	</div>
</template>

<script setup lang="ts">
import { useFieldPresentation } from '../field-presentation';
import type { RadioFieldComponentProps, RadioFieldState } from './radio-field';

const props = withDefaults(defineProps<RadioFieldComponentProps>(), {
	showLabel: true,
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: RadioFieldState];
}>();

const field = useFieldPresentation(props);

function changeValue(event: Event, value: string) {
	const target = event.target as HTMLInputElement | null;
	if (!target) {
		return;
	}

	emit('update:modelValue', target.checked ? value : '');
}
</script>
