<template>
	<div class="blf-collocation-field">
		<fieldset class="blf-collocation-section">
			<legend><span aria-hidden="true">1.</span> {{ $t('collocations.sections.keyword') }}</legend>
			<p class="help-block">{{ $t('collocations.keywordPatternHelp') }}</p>
			<CollocationPatternEditor
				:id="id"
				:html-id="`${htmlId}_keyword`"
				:model-value="modelValue.keyword"
				role="keyword"
				:annotation-options
				:create-annotation-field
				:advanced-field
				:expert-field
				:parse-pattern
				:disabled
				@update:model-value="update('keyword', $event)"
			/>
		</fieldset>

		<fieldset class="blf-collocation-section">
			<legend><span aria-hidden="true">2.</span> {{ $t('collocations.sections.collocate') }}</legend>
			<div class="checkbox">
				<label>
					<input
						type="checkbox"
						:disabled
						:checked="modelValue.collocate.enabled"
						:aria-controls="`${htmlId}_collocate_restriction`"
						:aria-expanded="modelValue.collocate.enabled"
						@change="update('collocate', { ...modelValue.collocate, enabled: ($event.target as HTMLInputElement).checked })"
					/>
					{{ $t('collocations.restrictCollocate') }}
				</label>
			</div>
			<p v-if="!modelValue.collocate.enabled" class="help-block">{{ $t('collocations.anyCollocate') }}</p>
			<div v-else :id="`${htmlId}_collocate_restriction`">
				<CollocationPatternEditor
					:id="id"
					:html-id="`${htmlId}_collocate`"
					:model-value="modelValue.collocate.pattern"
					role="collocate"
					:annotation-options
					:create-annotation-field
					:advanced-field
					:expert-field
					:parse-pattern
					:disabled
					@update:model-value="update('collocate', { ...modelValue.collocate, pattern: $event })"
				/>
			</div>
		</fieldset>

		<fieldset class="blf-collocation-section">
			<legend><span aria-hidden="true">3.</span> {{ $t('collocations.sections.context') }}</legend>
			<div class="row">
				<div class="form-group col-sm-3">
					<label :for="`${htmlId}_before`">{{ $t('collocations.before') }}</label>
					<input
						:id="`${htmlId}_before`"
						class="form-control"
						type="number"
						min="0"
						:max="Number.MAX_SAFE_INTEGER"
						step="1"
						required
						:disabled
						:value="modelValue.before"
						@input="update('before', Number(($event.target as HTMLInputElement).value))"
					/>
				</div>
				<div class="form-group col-sm-3">
					<label :for="`${htmlId}_after`">{{ $t('collocations.after') }}</label>
					<input
						:id="`${htmlId}_after`"
						class="form-control"
						type="number"
						min="0"
						:max="Number.MAX_SAFE_INTEGER"
						step="1"
						required
						:disabled
						:value="modelValue.after"
						@input="update('after', Number(($event.target as HTMLInputElement).value))"
					/>
				</div>
				<div class="form-group col-sm-6">
					<label :for="`${htmlId}_annotation`">{{ $t('collocations.annotation') }}</label>
					<SelectPicker
						:data-id="`${htmlId}_annotation`"
						:data-name="`${htmlId}_annotation`"
						:options="annotationOptions"
						data-width="100%"
						data-menu-width="grow"
						container="body"
						hideEmpty
						:disabled
						:model-value="modelValue.annotation"
						@update:model-value="updateAnnotation"
					/>
				</div>
			</div>
			<p v-if="modelValue.before + modelValue.after === 0" class="text-danger" role="alert">{{ $t('collocations.contextRequired') }}</p>

			<WithinField
				v-if="withinOptions.length > 1"
				:id="`${id}.within`"
				:html-id="`${htmlId}_within`"
				:model-value="withinState"
				:options="boundaryOptions"
				:sort-options="sortWithinOptions"
				:disabled
				variant="horizontal"
				@update:model-value="update('within', $event.element ?? '')"
			/>

			<div class="checkbox blf-collocation-calculation">
				<label>
					<input type="checkbox" :disabled :checked="modelValue.sensitive" @change="update('sensitive', ($event.target as HTMLInputElement).checked)" />
					{{ $t('collocations.sensitive') }}
				</label>
			</div>
		</fieldset>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { CollocationFieldComponentProps, CollocationFieldState } from '@/features/form/fields/collocation-field';
import type { WithinFieldState } from '@/features/form/fields/within-field';

import CollocationPatternEditor from '@/features/form/fields/CollocationPatternEditor.vue';
import WithinField from '@/features/form/fields/WithinField.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = withDefaults(defineProps<CollocationFieldComponentProps>(), {
	disabled: false,
	sortWithinOptions: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: CollocationFieldState];
}>();

const boundaryOptions = computed(() => props.withinOptions.map(option => ({ ...option, attributes: [] })));
const withinState = computed<WithinFieldState>(() => ({ element: props.modelValue.within || null, attributes: {} }));

function update<Key extends keyof CollocationFieldState>(key: Key, value: CollocationFieldState[Key]) {
	emit('update:modelValue', { ...props.modelValue, [key]: value });
}

function updateAnnotation(value: string | string[] | null) {
	const annotation = Array.isArray(value) ? value[0] : value;
	if (annotation != null) update('annotation', annotation);
}
</script>

<style lang="scss" scoped>
.blf-collocation-field {
	display: grid;
	gap: 20px;
	max-width: 900px;
}

.blf-collocation-section {
	min-width: 0;
	padding: 16px;
	border: 1px solid #ddd;
	border-radius: 4px;
}

.blf-collocation-section > legend {
	width: auto;
	margin: 0 0 8px;
	padding: 0 6px;
	font-size: 18px;
}

.blf-collocation-calculation {
	margin-top: 12px;
}
</style>
