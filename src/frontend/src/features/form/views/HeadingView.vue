<template>
	<header class="blf-heading-view">
		<h3>
			{{ resolvedTitle }}
			<a v-if="resolvedHelp" class="help" target="_blank" rel="noopener noreferrer" :href="resolvedHelp.href" :title="resolvedHelp.title" :aria-label="resolvedHelp.title">
				<span class="fa fa-info-circle" aria-hidden="true"></span>
			</a>
		</h3>
		<p v-if="resolvedDescription">{{ resolvedDescription }}</p>
	</header>
</template>

<script setup lang="ts">
import { computed, toValue } from 'vue';

import type { HeadingViewConfig } from '../model/views/heading-view';

const props = defineProps<HeadingViewConfig>();
const resolvedTitle = computed(() => toValue(props.title));
const resolvedDescription = computed(() => (props.description ? toValue(props.description) : ''));
const resolvedHelp = computed(() => (props.help ? { href: toValue(props.help.href), title: toValue(props.help.title) } : null));
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

.help {
	font-size: 0.8em;
	position: relative;
	top: -0.5em;
	color: black;
	opacity: 0.5;
}
</style>
