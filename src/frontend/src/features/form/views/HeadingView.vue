<template>
	<header class="blf-heading-view">
		<h3>{{ title }}</h3>
		<p v-if="description">{{ description }}</p>
	</header>
</template>

<script setup lang="ts">

import type { HeadingViewConfig } from '@/features/form/model/views/heading-view';

defineProps<HeadingViewConfig>();
</script>

<style lang="scss" scoped>
.blf-heading-view {
	display: grid;
	gap: 4px;
}

h3,
p {
	margin: 0;
}

h3 {
	font-size: 1.05em;
}

p {
	color: var(--blf-text-muted);
}
</style>
