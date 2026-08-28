<template>
	<div v-bind="field.rootAttrs">
		<label v-if="!hideLabel" :for="`${htmlId}_query`" :class="field.labelClass">
			{{ $t(`search.expert.corpusQueryLanguage`) }}
			<a class="help" target="_blank" href="https://blacklab.ivdnt.org/guide/corpus-query-language.html" :title="$t(`widgets.learnMore`)">?</a>
		</label>
		<div :class="field.controlsClass">
			<textarea
				:class="['form-control', 'querybox', field.inputClass]"
				:id="`${htmlId}_query`"
				rows="7"
				:value="modelValue"
				:disabled
				:aria-label="hideLabel ? $t(`search.expert.corpusQueryLanguage`) : undefined"
				@input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useFieldPresentation } from '@/features/form/fields/field-presentation';
import type { RawCqlQueryFieldComponentProps, RawCqlQueryFieldState } from '@/features/form/fields/raw-cql-field';

const props = defineProps<RawCqlQueryFieldComponentProps>();

const emit = defineEmits<{
	'update:modelValue': [value: RawCqlQueryFieldState];
}>();

const field = useFieldPresentation(props, { formGroup: false, rootClass: 'blf-expert-query-field' });
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
