<template>
	<div :class="fieldClasses">
		<label :for="`${htmlId}_query`">
			{{ label || 'Corpus Query Language' }}
			<a v-if="helpUrl" class="help" target="_blank" :href="helpUrl" title="Learn more">?</a>
		</label>
		<textarea class="blf-input form-control querybox" :id="`${htmlId}_query`" :rows="rows || 7" :value="modelValue.query" @input="updateQuery(($event.target as HTMLTextAreaElement).value)" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { RawCqlQueryFieldConfig, RawCqlQueryFieldState } from '@/features/form/model/controllers/raw-cql-query-controller';
import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types/form-shape';

const props = defineProps<ImplicitFieldComponentProps<RawCqlQueryFieldState> & RawCqlQueryFieldConfig>();

const emit = defineEmits<{
	'update:modelValue': [value: RawCqlQueryFieldState];
}>();

const fieldClasses = computed(() => ['blf-field', 'blf-expert-query-field', decodeVariants(props.variant)]);
const htmlId = computed(() => props.htmlId);

function updateQuery(query: string) {
	emit('update:modelValue', { ...props.modelValue, query });
}
</script>

<style lang="scss" scoped>
.blf-expert-query-field .help {
	font-size: 0.8em;

	// superscript
	position: relative;
	top: -0.5em;
	color: black;
	opacity: 0.5;
	margin-left: 4px;
}

.querybox {
	width: 100%;
	resize: none;
	margin-bottom: 10px;
}
</style>
