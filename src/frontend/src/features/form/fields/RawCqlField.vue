<template>
	<div :class="fieldClasses">
		<label :for="`${htmlId}_query`">
			{{ config.label || 'Corpus Query Language' }}
			<a v-if="config.helpUrl" class="help" target="_blank" :href="config.helpUrl" title="Learn more">?</a>
		</label>
		<textarea class="blf-input form-control querybox" :id="`${htmlId}_query`" :rows="config.rows || 7" :value="modelValue.query" @input="updateQuery(($event.target as HTMLTextAreaElement).value)" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { RawCqlQueryFieldConfig, RawCqlQueryFieldState } from '@/features/form/model/controllers/raw-cql-query-controller';
import { getVariantClassNames } from '@/features/form/model/types/form-shape';

const props = defineProps<{
	config: RawCqlQueryFieldConfig;
	htmlId: string;
	modelValue: RawCqlQueryFieldState;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: RawCqlQueryFieldState];
}>();

const config = computed(() => props.config);
const fieldClasses = computed(() => ['blf-field', 'blf-expert-query-field', ...getVariantClassNames(props.config, 'blf-field')]);
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
