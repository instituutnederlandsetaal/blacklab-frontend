<template>
	<component v-if="debugSystem.debug.value && instance?.vnode.props != null && Object.prototype.hasOwnProperty.call(instance.vnode.props, 'is')" :is="is" v-bind="attrs"><slot /></component>
	<template v-else-if="debugSystem.debug.value"><slot /></template>
</template>
<script setup lang="ts">
import { getCurrentInstance, useAttrs, type resolveDynamicComponent } from 'vue';

import { useDebugSystem } from './debug';

defineOptions({
	inheritAttrs: false,
});

defineProps<{
	is?: Parameters<typeof resolveDynamicComponent>[0];
}>();

const attrs = useAttrs();
const instance = getCurrentInstance();
const debugSystem = useDebugSystem();
</script>
