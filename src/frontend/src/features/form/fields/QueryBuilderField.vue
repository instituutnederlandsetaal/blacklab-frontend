<template>
	<div :class="fieldClasses">
		<CqlQueryBuilder :model-value="modelValue" :options="options" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { decodeVariants } from '@/features/form/model/form-utils';
import type { QueryBuilderFieldConfig, QueryBuilderFieldState } from '@/features/form/model/controllers/query-builder-controller';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types/form-shape';
import CqlQueryBuilder from '@/widgets/cql-query-builder/CqlQueryBuilder.vue';

const props = withDefaults(defineProps<ImplicitFieldComponentProps<QueryBuilderFieldState> & QueryBuilderFieldConfig>(), {
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: QueryBuilderFieldState];
}>();

const fieldClasses = computed(() => ['blf-field', 'blf-query-builder-field', decodeVariants(props.variant)]);
</script>
