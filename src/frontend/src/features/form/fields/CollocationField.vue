<template>
	<div class="blf-collocation-field">
		<fieldset v-for="(role, index) in patternRoles" :key="role" class="blf-collocation-section">
			<legend>
				<span aria-hidden="true">{{ index + 1 }}.</span> {{ $t(`collocations.sections.${role}`) }}
			</legend>
			<p v-if="role === 'keyword'" class="help-block">{{ $t('collocations.keywordPatternHelp') }}</p>
			<template v-else>
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
			</template>
			<div v-if="role === 'keyword' || modelValue.collocate.enabled" :id="role === 'collocate' ? `${htmlId}_collocate_restriction` : undefined">
				<p v-if="role === 'collocate'" class="help-block">{{ $t('collocations.singleTokenCollocateHelp') }}</p>
				<CollocationPatternEditor
					:id="id"
					:html-id="`${htmlId}_${role}`"
					:model-value="role === 'keyword' ? modelValue.keyword : modelValue.collocate.pattern"
					:role
					:annotation-options
					:create-annotation-field
					:query-builder-options
					:parse-pattern
					:disabled
					@update:model-value="role === 'keyword' ? update('keyword', $event) : update('collocate', { ...modelValue.collocate, pattern: $event })"
				/>
			</div>
		</fieldset>

		<fieldset class="blf-collocation-section">
			<legend><span aria-hidden="true">3.</span> {{ $t('collocations.sections.context') }}</legend>
			<div class="row">
				<div v-for="side in contextSides" :key="side" class="form-group col-sm-3">
					<label :for="`${htmlId}_${side}`">{{ $t(`collocations.${side}`) }}</label>
					<input
						:id="`${htmlId}_${side}`"
						class="form-control"
						type="number"
						min="0"
						:max="Number.MAX_SAFE_INTEGER"
						step="1"
						required
						:disabled
						:value="modelValue[side]"
						@input="update(side, Number(($event.target as HTMLInputElement).value))"
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

const patternRoles = ['keyword', 'collocate'] as const;
const contextSides = ['before', 'after'] as const;

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
