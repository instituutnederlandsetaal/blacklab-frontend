<template>
	<div v-bind="field.rootAttrs">
		<NumberField
			:id="`${id}.length`"
			:html-id="`${htmlId}_length`"
			:model-value="modelValue.length"
			:display-name="lengthDisplayName"
			:min="lengthBounds.min"
			:max="lengthBounds.max"
			:step="1"
			:disabled
			:variant="lengthVariant"
			@update:model-value="updateLength"
		/>

		<div class="blf-token-sequence-tokens">
			<div v-for="(token, index) in modelValue" :key="index" class="blf-token-sequence-token">
				<SelectField
					:id="`${id}.token.${index}.selector`"
					:html-id="`${htmlId}_${index}_selector`"
					:model-value="[token.fieldId]"
					:display-name="selectorDisplayName"
					:placeholder="selectorPlaceholder"
					:options="selectorOptions"
					:disabled
					:variant="tokenVariant"
					:show-label="false"
					hide-empty
					html
					@update:model-value="updateTokenField(index, $event)"
				/>

				<FieldRenderer
					:field="createTokenSequenceFieldNode({ ...props, variant: tokenVariant }, index, token.fieldId)"
					:model-value="token.fieldState"
					:html-id="`${htmlId}_${index}_${token.fieldId.replace(/[^\w-]+/g, '_') || 'field'}`"
					:disabled
					@update:model-value="updateTokenState(index, $event)"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '@/features/form/fields/field-presentation';
import { useFormSystemRuntime } from '@/features/form/model/runtime';
import type { BaseFieldNode } from '@/features/form/model/types/form-shape';

import {
	createDefaultTokenSequenceToken,
	createTokenSequenceFieldNode,
	resolveTokenSequenceFieldId,
	tokenSequenceLengthBounds,
	type TokenSequenceFieldComponentProps,
	type TokenSequenceFieldState,
} from './token-sequence-field';

import NumberField from '@/features/form/fields/generic/NumberField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';
import FieldRenderer from '@/features/form/ui/FieldRenderer.vue';

defineOptions({ name: 'TokenSequenceField', inheritAttrs: false });

const props = defineProps<TokenSequenceFieldComponentProps>();
const emit = defineEmits<{
	'update:modelValue': [value: TokenSequenceFieldState];
}>();

const runtime = useFormSystemRuntime();
const field = useFieldPresentation(props, { formGroup: false, horizontal: false, rootClass: 'blf-token-sequence-field' });
const lengthBounds = computed(() => tokenSequenceLengthBounds(props));
const tokenVariant = computed<BaseFieldNode['variant']>(() => {
	const variants = (Array.isArray(props.variant) ? props.variant : [props.variant]).filter((variant): variant is NonNullable<typeof variant> => !!variant && variant !== 'horizontal');
	return variants.length > 1 ? variants : variants[0];
});
const lengthVariant = computed<BaseFieldNode['variant']>(() => {
	const variants = tokenVariant.value == null ? [] : Array.isArray(tokenVariant.value) ? tokenVariant.value : [tokenVariant.value];
	return [...variants, 'horizontal'];
});

function updateLength(requestedLength: number) {
	const normalizedLength = Number.isFinite(requestedLength) ? Math.trunc(requestedLength) : lengthBounds.value.defaultValue;
	const length = Math.min(lengthBounds.value.max, Math.max(lengthBounds.value.min, normalizedLength));
	const nextTokens = props.modelValue.slice(0, length);
	while (nextTokens.length < length) nextTokens.push(createDefaultTokenSequenceToken(props, runtime.value.definition.context, nextTokens.length));
	emit('update:modelValue', nextTokens);
}

function updateTokenField(index: number, selection: string | string[]) {
	if (!Array.isArray(selection)) selection = selection ? [selection] : [];
	const selectedFieldId = resolveTokenSequenceFieldId(props, selection[0]);
	const current = props.modelValue[index];
	if (!current || current.fieldId === selectedFieldId) return;
	const nextTokens = props.modelValue.slice();
	nextTokens[index] = createDefaultTokenSequenceToken(props, runtime.value.definition.context, index, selectedFieldId);
	emit('update:modelValue', nextTokens);
}

function updateTokenState(index: number, fieldState: unknown) {
	const current = props.modelValue[index];
	if (!current) return;
	const nextTokens = props.modelValue.slice();
	nextTokens[index] = { ...current, fieldState };
	emit('update:modelValue', nextTokens);
}
</script>

<style lang="scss" scoped>
.blf-token-sequence-field {
	display: grid;
	// gap: 15px;
}

.blf-token-sequence-tokens {
	display: flex;
	flex-wrap: nowrap;
	gap: 15px;
}

.blf-token-sequence-token {
	display: grid;
	flex: 1 1 0;
	// gap: 8px;
	min-width: 0;
	align-content: start;
}

@media (max-width: 760px) {
	.blf-token-sequence-tokens {
		flex-wrap: wrap;
	}

	.blf-token-sequence-token {
		flex-basis: min(100%, 220px);
	}
}
</style>
