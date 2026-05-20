<template>
	<Component :is="node.view.component" :node="node" />
</template>

<script setup lang="ts">
import type { FormViewNode } from '@/features/form/model/types/form-shape';

const props = defineProps<{
	node: FormViewNode;
}>();
</script>

<style lang="scss" scoped>
.blf-missing-node {
	border: 1px dashed #b94a48;
	border-radius: 4px;
	color: #8a2b29;
	padding: 8px;
}
</style>
