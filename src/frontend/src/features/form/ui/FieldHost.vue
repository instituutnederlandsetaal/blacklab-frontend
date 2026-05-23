<template>
	<Component :is="node.component" :config="node.config" :html-id="htmlId" v-model="state" />
</template>

<script setup lang="ts" generic="State">
import { computed } from 'vue';

import type { FormFieldNode } from '@/features/form/model/types/form-shape';

import useUid from '@/shared/utils/useUid';

import { useFormSystemRuntime } from '../model/runtime';

const props = defineProps<{
	node: FormFieldNode<any, State>;
}>();

const runtime = useFormSystemRuntime();
const uid = useUid();
const htmlId = computed(() => `${props.node.id}_${uid}`);
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
