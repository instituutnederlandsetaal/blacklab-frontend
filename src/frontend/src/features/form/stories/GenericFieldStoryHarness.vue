<template>
	<div class="panel panel-default">
		<div class="panel-body">
			<!-- <component :is="fieldComponent" v-bind="config" :html-id="htmlId" :model-value="modelValue" :show-label="showLabel" :variant="variant" @update:model-value="updateValue" /> -->
			<form-system :definition :context :initialState @ready="runtime = $event" />
		</div>
	</div>
	<pre class="well">{{ serializedState }}</pre>
	<pre class="well">{{ serializedCompiled }}</pre>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';

import { getAllFields } from '@/features/form/model/form-utils';
import type { FormSystemDefinition, FormRuntimeContext, FormState, FormSystemRuntime } from '@/features/form/model/types';

import FormSystem from '@/features/form/ui/FormSystem.vue';

const props = defineProps<{
	definition: FormSystemDefinition;
	context: FormRuntimeContext;
	initialState?: FormState;
	variant?: string | string[];
}>();

const allFields = computed(() => getAllFields(props.definition.root));
watchEffect(() => {
	console.log('Updating field variants', props.variant);
	allFields.value.forEach(field => (field.variant = props.variant));
});

const runtime = ref<FormSystemRuntime>();

const serializedState = computed(() => JSON.stringify(runtime.value?.state.controllerState, undefined, 2));
const serializedCompiled = computed(() => {
	const formIds = Object.keys(runtime.value?.forms || {});
	return formIds.length ? JSON.stringify(Object.fromEntries(formIds.map(id => [id, runtime.value?.compile(id)])), undefined, 2) : '';
});
</script>

<style lang="scss" scoped></style>
