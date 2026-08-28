<template>
	<div v-bind="field.rootAttrs">
		<CqlQueryBuilder :model-value="modelValue" :options :disabled @update:model-value="emit('update:modelValue', $event)" />
	</div>
</template>

<script setup lang="ts">
import { useFieldPresentation } from '@/features/form/fields/field-presentation';
import type { QueryBuilderFieldComponentProps, QueryBuilderFieldState } from '@/features/form/fields/query-builder-field';

import CqlQueryBuilder from '@/features/cql-query-builder/CqlQueryBuilder.vue';

const props = defineProps<QueryBuilderFieldComponentProps>();

const emit = defineEmits<{
	'update:modelValue': [value: QueryBuilderFieldState];
}>();

const field = useFieldPresentation(props, { formGroup: false, rootClass: 'blf-query-builder-field' });
</script>
