<template>
	<div class="blf-collocation-field">
		<div class="form-group">
			<label :for="`${htmlId}-patt`">{{ $t('collocations.keywordPattern') }}</label>
			<input
				:id="`${htmlId}-patt`"
				class="form-control"
				type="text"
				required
				:disabled
				:placeholder="$t('collocations.keywordPatternPlaceholder')"
				:value="modelValue.patt"
				@input="update('patt', ($event.target as HTMLInputElement).value)"
			/>
			<p class="help-block">{{ $t('collocations.keywordPatternHelp') }}</p>
		</div>

		<div class="form-group">
			<label :for="`${htmlId}-collpatt`">{{ $t('collocations.collocatePattern') }}</label>
			<input
				:id="`${htmlId}-collpatt`"
				class="form-control"
				type="text"
				:disabled
				:placeholder="$t('collocations.collocatePatternPlaceholder')"
				:value="modelValue.collpatt"
				@input="update('collpatt', ($event.target as HTMLInputElement).value)"
			/>
		</div>

		<div class="row">
			<div class="form-group col-sm-6">
				<label :for="`${htmlId}-context`">{{ $t('collocations.context') }}</label>
				<input
					:id="`${htmlId}-context`"
					class="form-control"
					type="text"
					pattern="[0-9]+(:[0-9]+)?"
					:disabled
					placeholder="5 or 3:4"
					:value="modelValue.context"
					@input="update('context', ($event.target as HTMLInputElement).value)"
				/>
			</div>

			<div class="form-group col-sm-6">
				<label :for="`${htmlId}-within`">{{ $t('collocations.within') }}</label>
				<input
					:id="`${htmlId}-within`"
					class="form-control"
					type="text"
					:disabled
					:placeholder="$t('collocations.withinPlaceholder')"
					:value="modelValue.within"
					@input="update('within', ($event.target as HTMLInputElement).value)"
				/>
			</div>
		</div>

		<div class="row">
			<div class="form-group col-sm-6">
				<label :for="`${htmlId}-annotation`">{{ $t('collocations.annotation') }}</label>
				<select :id="`${htmlId}-annotation`" class="form-control" :disabled :value="modelValue.annotation" @change="update('annotation', ($event.target as HTMLSelectElement).value)">
					<option v-for="option in annotationOptions" :key="option.value" :value="option.value">{{ option.label() }}</option>
				</select>
			</div>
			<div class="form-group col-sm-6">
				<label :for="`${htmlId}-scorer`">{{ $t('collocations.scorer') }}</label>
				<select
					:id="`${htmlId}-scorer`"
					class="form-control"
					:disabled
					:value="modelValue.scorertype"
					@change="update('scorertype', ($event.target as HTMLSelectElement).value as BLCollocationScorer)"
				>
					<option value="coll-dice">{{ $t('collocations.scorers.dice') }}</option>
					<option value="coll-salience">{{ $t('collocations.scorers.salience') }}</option>
				</select>
			</div>
		</div>

		<div class="checkbox">
			<label>
				<input type="checkbox" :disabled :checked="modelValue.sensitive" @change="update('sensitive', ($event.target as HTMLInputElement).checked)" />
				{{ $t('collocations.sensitive') }}
			</label>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { CollocationFieldComponentProps, CollocationFieldState } from '@/features/form/fields/collocation-field';
import type { BLCollocationScorer } from '@/types/blacklabtypes';

const props = withDefaults(defineProps<CollocationFieldComponentProps>(), {
	disabled: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: CollocationFieldState];
}>();

function update<Key extends keyof CollocationFieldState>(key: Key, value: CollocationFieldState[Key]) {
	emit('update:modelValue', { ...props.modelValue, [key]: value });
}
</script>

<style scoped>
.blf-collocation-field {
	max-width: 850px;
}
</style>
