<template>
	<template v-if="debugSystem.debug.value"><slot /></template>
</template>
<script setup lang="ts">
import { useDebugSystem } from './debug';

const debugSystem = useDebugSystem();
</script>
