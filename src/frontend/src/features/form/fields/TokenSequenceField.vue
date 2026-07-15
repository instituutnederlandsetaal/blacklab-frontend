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
			:variant
			@update:model-value="updateLength"
		/>

		<div class="blf-token-sequence-tokens">
			<div v-for="(token, index) in modelValue" :key="index" class="blf-token-sequence-token">
				<SelectField
					:id="`${id}.${index}.selector`"
					:html-id="`${htmlId}_${index}_selector`"
					:model-value="[resolvedChild(token.fieldId).id]"
					:display-name="selectorDisplayName"
					:placeholder="selectorPlaceholder"
					:options="selectorOptions"
					:disabled
					:variant
					:show-label="false"
					hide-empty
					html
					@update:model-value="updateTokenField(index, $event)"
				/>

				<component
					:is="resolvedChild(token.fieldId).component"
					:key="resolvedChild(token.fieldId).id"
					v-bind="childComponentProps(token, index)"
					@update:model-value="updateTokenState(index, $event)"
				/>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useFieldPresentation } from '@/features/form/fields/field-presentation';
import { createRenderedNodeProps } from '@/features/form/model/field-component-props';
import { useFormSystemRuntime } from '@/features/form/model/runtime';

import {
	clampTokenSequenceLength,
	createDefaultTokenSequenceToken,
	createTokenSequenceChildConfig,
	getTokenSequenceChild,
	tokenSequenceLengthBounds,
	type TokenSequenceFieldComponentProps,
	type TokenSequenceTokenState,
} from './token-sequence-field';

import NumberField from '@/features/form/fields/generic/NumberField.vue';
import SelectField from '@/features/form/fields/generic/SelectField.vue';

defineOptions({ name: 'TokenSequenceField', inheritAttrs: false });

const props = withDefaults(defineProps<TokenSequenceFieldComponentProps>(), {
	disabled: false,
});
const emit = defineEmits<{
	'update:modelValue': [value: TokenSequenceTokenState[]];
}>();

const runtime = useFormSystemRuntime();
const field = useFieldPresentation(props, { formGroup: false, rootClass: 'blf-token-sequence-field' });
const lengthBounds = computed(() => tokenSequenceLengthBounds(props));

function resolvedChild(fieldId?: string | null) {
	return getTokenSequenceChild(props, fieldId);
}

function updateLength(requestedLength: number) {
	const length = clampTokenSequenceLength(requestedLength, lengthBounds.value);
	const tokens = props.modelValue.slice(0, length);
	while (tokens.length < length) tokens.push(createDefaultTokenSequenceToken(props, runtime.value.definition.context, tokens.length));
	emit('update:modelValue', tokens);
}

function updateTokenField(index: number, selection: string[]) {
	const child = resolvedChild(selection[0]);
	const tokens = props.modelValue.slice();
	if (!tokens[index] || tokens[index].fieldId === child.id) return;
	tokens[index] = createDefaultTokenSequenceToken(props, runtime.value.definition.context, index, child.id);
	emit('update:modelValue', tokens);
}

function updateTokenState(index: number, fieldState: unknown) {
	const current = props.modelValue[index];
	if (!current) return;
	const tokens = props.modelValue.slice();
	tokens[index] = { ...current, fieldState };
	emit('update:modelValue', tokens);
}

function childComponentProps(token: TokenSequenceTokenState, index: number) {
	const child = resolvedChild(token.fieldId);
	const childConfig = createTokenSequenceChildConfig(props, child, index);
	const config = createRenderedNodeProps(childConfig, ['kind']);
	return {
		...config,
		htmlId: `${props.htmlId}_${index}_${safeHtmlId(child.id)}`,
		modelValue: token.fieldId === child.id ? token.fieldState : createDefaultTokenSequenceToken(props, runtime.value.definition.context, index, child.id).fieldState,
		disabled: props.disabled,
		showLabel: false,
	};
}

function safeHtmlId(value: string) {
	return value.replace(/[^\w-]+/g, '_') || 'field';
}
</script>

<style lang="scss" scoped>
.blf-token-sequence-field {
	display: grid;
	gap: 14px;
}

.blf-token-sequence-tokens {
	display: flex;
	flex-wrap: nowrap;
	gap: 15px;
}

.blf-token-sequence-token {
	display: grid;
	flex: 1 1 0;
	gap: 8px;
	min-width: 0;
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
