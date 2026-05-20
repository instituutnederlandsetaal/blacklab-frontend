<template>
	<div class="blf-field blf-annotation-field" :class="`variant-${config.variant || 'default'}`">
		<label :for="inputId">
			{{ config.displayName }}
		</label>

		<select v-if="config.uiType === 'select'" :id="inputId" class="blf-input" :value="state.value" @change="updateValue(($event.target as HTMLSelectElement).value)">
			<option value=""></option>
			<option v-for="option in options" :key="option.value" :value="option.value" :title="option.title || undefined">
				{{ option.label || option.value }}
			</option>
		</select>
		<input v-else :id="inputId" class="blf-input" type="text" :placeholder="config.displayName" :value="state.value" @input="updateValue(($event.target as HTMLInputElement).value)" />

		<label v-if="config.caseSensitive" class="blf-checkbox-inline">
			<input type="checkbox" :checked="state.caseSensitive" @change="updateCase(($event.target as HTMLInputElement).checked)" />
			Case sensitive
		</label>
		<small v-if="config.description" class="blf-help-text">{{ config.description }}</small>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { AnnotationFieldConfig, AnnotationFieldState } from '@/features/form/model/controllers/annotation-controller';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

import { isOption, isSimpleOption, type Option } from '@/shared/utils/options';
import useUid from '@/shared/utils/useUid';

const props = defineProps<{
	node: FormFieldNode<AnnotationFieldConfig>;
	state: AnnotationFieldState;
}>();

const emit = defineEmits<{
	'update:state': [state: AnnotationFieldState];
}>();

const uid = useUid();

const config = computed(() => props.node.config);
const state = computed(() => props.state);
const inputId = computed(() => `${props.node.id}_${uid}_value`);
const options = computed<Option[]>(() =>
	(config.value.options ?? []).flatMap(option => {
		if (isSimpleOption(option)) return { value: option };
		if (isOption(option)) return option;
		return option.options.map(groupOption => (isSimpleOption(groupOption) ? { value: groupOption } : groupOption));
	}),
);

function updateValue(value: string) {
	emit('update:state', { ...props.state, value });
}

function updateCase(caseSensitive: boolean) {
	emit('update:state', { ...props.state, caseSensitive });
}
</script>
