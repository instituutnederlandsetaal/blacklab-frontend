<template>
	<header class="blf-heading-view">
		<h3>{{ resolvedTitle }}</h3>
		<p v-if="resolvedDescription">{{ resolvedDescription }}</p>
	</header>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import type { HeadingViewConfig } from '../model/views/heading-view';

const props = defineProps<HeadingViewConfig>();
const resolvedTitle = computed(() => toValue(props.title));
const resolvedDescription = computed(() => (props.description ? toValue(props.description) : ''));
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

p {
	color: var(--blf-text-muted);
}
</style>
