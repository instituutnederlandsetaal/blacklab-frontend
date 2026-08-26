<template>
	<component :is="field.component" :key="field.id" v-bind="componentProps" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { createRenderedNodeProps } from '@/features/form/model/field-component-props';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import { RESTORABLE_FORM_PARAMETERS, type RestorableFormParameter } from '@/features/form/model/types/blacklab-params';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

const props = withDefaults(
	defineProps<{
		field: FormFieldNode;
		modelValue: unknown;
		htmlId: string;
		disabled?: boolean;
	}>(),
	{
		disabled: false,
	},
);
const emit = defineEmits<{
	'update:modelValue': [value: unknown];
}>();

const runtime = useFormSystemRuntime();
const componentProps = computed(() => ({
	...createRenderedNodeProps(props.field, ['component', 'controller', 'kind']),
	disabled:
		props.disabled ||
		props.field.controller.outputs.some(
			output => (RESTORABLE_FORM_PARAMETERS as readonly string[]).includes(output) && runtime.value.state.rawOverrides.value[output as RestorableFormParameter] !== undefined,
		),
	htmlId: props.htmlId,
	modelValue: props.modelValue,
	'onUpdate:modelValue': (value: unknown) => emit('update:modelValue', value),
}));
</script>
