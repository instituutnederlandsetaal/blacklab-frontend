<template>
	<Component v-if="node.kind === 'container' && node.component" :is="node.component" :node="node" :hide-title="hideTitle" />
	<ContainerRenderer v-else-if="node.kind === 'container'" :node="node" :hide-title="hideTitle" />
	<FormRenderer v-else-if="node.kind === 'form'" :node="node" :hide-title="hideTitle" />
	<FieldHost v-else-if="node.kind === 'field'" :node="node" />
	<ViewHost v-else-if="node.kind === 'view'" :node="node" />
</template>

<script setup lang="ts">
import type { FormNode } from '@/features/form/model/types/form-shape';

import ContainerRenderer from './ContainerRenderer.vue';
import FieldHost from './FieldHost.vue';
import FormRenderer from './FormRenderer.vue';
import ViewHost from './ViewHost.vue';

defineProps<{
	node: FormNode;
	hideTitle?: boolean;
}>();
</script>
