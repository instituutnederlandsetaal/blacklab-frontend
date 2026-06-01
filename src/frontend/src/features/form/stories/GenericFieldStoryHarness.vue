<template>
	<div class="blf-generic-field-story">
		<div class="blf-generic-field-story__field">
			<component :is="fieldComponent" v-bind="config" :html-id="htmlId" :model-value="modelValue" :show-label="showLabel" @update:model-value="updateValue" />
		</div>
		<pre class="blf-generic-field-story__state">{{ serializedState }}</pre>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';

const props = withDefaults(
	defineProps<{
		fieldComponent: Component;
		config: object;
		initialValue: unknown;
		htmlId?: string;
		showLabel?: boolean;
	}>(),
	{
		htmlId: 'storybook-generic-field',
		showLabel: true,
	},
);

const modelValue = ref(structuredClone(props.initialValue));

watch(
	() => props.initialValue,
	value => {
		modelValue.value = structuredClone(value);
	},
	{ deep: true },
);

const serializedState = computed(() => JSON.stringify(modelValue.value, null, 2));

function updateValue(value: unknown) {
	modelValue.value = value;
}
</script>

<style lang="scss" scoped>
.blf-generic-field-story {
	display: grid;
	gap: 24px;
	max-width: 720px;
	padding: 24px;
	background: linear-gradient(180deg, #f8f6f0 0%, #ffffff 100%);
	border: 1px solid #ddd6c8;
	border-radius: 12px;
}

.blf-generic-field-story__field {
	padding: 20px;
	background: #fff;
	border: 1px solid #e6dfd3;
	border-radius: 10px;
	box-shadow: 0 10px 30px rgba(56, 43, 20, 0.06);
}

.blf-generic-field-story__state {
	margin: 0;
	padding: 16px;
	background: #201a16;
	color: #f8f3eb;
	border-radius: 10px;
	font-size: 12px;
	line-height: 1.5;
	overflow-x: auto;
}
</style>
