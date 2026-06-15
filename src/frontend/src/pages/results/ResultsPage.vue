<template>
	<div>Results for {{ pageName }}</div>
	<pre>{{ query }}</pre>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { isBlacklabParameter, type BlackLabParameters } from '@/features/form/model/types/blacklab-params';

const route = useRoute();

const query = computed(() => {
	return Object.entries(route.query).reduce<BlackLabParameters>((acc, [name, value]) => {
		if (isBlacklabParameter(name)) {
			acc[name] = value as string;
		}
		return acc;
	}, {});
});

const pageName = computed(() => route.params.pathMatch);
</script>

<style lang="scss"></style>
