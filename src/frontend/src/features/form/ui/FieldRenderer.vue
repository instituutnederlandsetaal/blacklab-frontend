<template>
	<component :is="field.component" :key="field.id" v-bind="componentProps" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { createRenderedNodeProps } from '@/features/form/model/field-component-props';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

const props = defineProps<{
	field: FormFieldNode;
	modelValue: unknown;
	htmlId: string;
	disabled?: boolean;
}>();
const emit = defineEmits<{
	'update:modelValue': [value: unknown];
}>();

const runtime = useFormSystemRuntime();
const componentProps = computed(() => ({
	...createRenderedNodeProps(props.field, ['component', 'controller', 'kind']),
	disabled: props.disabled || props.field.controller.outputs.some(output => output in runtime.value.state.rawOverrides.value),
	htmlId: props.htmlId,
	modelValue: props.modelValue,
	'onUpdate:modelValue': (value: unknown) => emit('update:modelValue', value),
}));
</script>
