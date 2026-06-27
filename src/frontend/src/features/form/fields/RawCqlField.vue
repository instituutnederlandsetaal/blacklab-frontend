<template>
	<div :class="fieldClasses">
		<label :for="`${htmlId}_query`">
			{{ $t(`search.expert.corpusQueryLanguage`) }}
			<a class="help" target="_blank" href="https://blacklab.ivdnt.org/guide/corpus-query-language.html" :title="$t(`widgets.learnMore`)">?</a>
		</label>
		<textarea class="form-control querybox" :id="`${htmlId}_query`" rows="7" :value="modelValue" :disabled @input="updateQuery(($event.target as HTMLTextAreaElement).value)" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { RawCqlQueryFieldState } from '@/features/form/model/controllers/raw-cql-query-controller';
import { decodeVariants } from '@/features/form/model/form-utils';
import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

const props = withDefaults(defineProps<ImplicitFieldComponentProps<RawCqlQueryFieldState>>(), {
	disabled: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: RawCqlQueryFieldState];
}>();

const fieldClasses = computed(() => ['blf-field', 'blf-expert-query-field', decodeVariants(props.variant)]);
const htmlId = computed(() => props.htmlId);

function updateQuery(query: string) {
	emit('update:modelValue', query);
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
