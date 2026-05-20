<template>
	<header class="blf-heading-view">
		<h3>{{ config.title }}</h3>
		<p v-if="config.description">{{ config.description }}</p>
	</header>
</template>

<script setup lang="ts">
import type { FormViewNode } from '@/features/form/model/types/form-shape';
import type { HeadingViewConfig } from '@/features/form/model/views/heading-view';

const {
	node: { config },
} = defineProps<{
	node: FormViewNode<HeadingViewConfig>;
}>();
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
