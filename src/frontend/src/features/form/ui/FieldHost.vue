<template>
	<Component :is="node.controller.component" :node="node" v-model:state="state" />
</template>

<script setup lang="ts" generic="State, Config">
import { computed } from 'vue';

import type { FormFieldNode } from '@/features/form/model/types/form-shape';

import { useFormSystemRuntime } from '../model/runtime';

const props = defineProps<{
	node: FormFieldNode;
}>();

const runtime = useFormSystemRuntime();
const state = computed({
	get(): State {
		return runtime.state.value.controllerState[props.node.id] as State;
	},
	set(value: State) {
		runtime.state.value.controllerState[props.node.id] = value;
	},
});
</script>

<style lang="scss" scoped>
.blf-missing-node {
	border: 1px dashed #b94a48;
	border-radius: 4px;
	color: #8a2b29;
	padding: 8px;
}
</style>
