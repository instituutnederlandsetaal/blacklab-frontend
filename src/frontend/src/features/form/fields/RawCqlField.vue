<template>
	<div class="blf-field blf-expert-query-field">
		<label :for="`${node.id}_query`">
			{{ config.label || 'Corpus Query Language' }}
			<a v-if="config.helpUrl" class="help" target="_blank" :href="config.helpUrl" title="Learn more">?</a>
		</label>
		<textarea class="blf-input querybox" :id="`${node.id}_query`" :rows="config.rows || 7" :value="state.query" @input="updateQuery(($event.target as HTMLTextAreaElement).value)" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { RawCqlQueryFieldConfig, RawCqlQueryFieldState } from '@/features/form/model/controllers/raw-cql-query-controller';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

const props = defineProps<{
	node: FormFieldNode<RawCqlQueryFieldConfig>;
	state: RawCqlQueryFieldState;
}>();

const emit = defineEmits<{
	'update:state': [state: RawCqlQueryFieldState];
}>();

const node = computed(() => props.node);
const config = computed(() => props.node.config);
const state = computed(() => props.state);

function updateQuery(query: string) {
	emit('update:state', { ...props.state, query });
}
</script>

<style lang="scss" scoped>
@use 'sass:color';

h3 .help {
	font-size: 0.8em;

	// superscript
	position: relative;
	top: -0.5em;
	color: black;
	opacity: 0.5;
}

.querybox {
	width: 100%;
	resize: none;
	margin-bottom: 10px;
}
</style>
