<template>
	<template v-if="debug"><slot /></template>
</template>
<script setup lang="ts">
import debug from '@/utils/debug';
</script>
