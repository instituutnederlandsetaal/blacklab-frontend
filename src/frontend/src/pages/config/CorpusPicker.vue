<template>
	<div class="container">
		<template v-if="loading">
			<span class="fa fa-spinner fa-spin fa-4x"></span>
			LOADING
		</template>
		<div v-else-if="error">{{ error }} <button type="button" @click="load">try again</button></div>
		<template v-else>
			<div v-for="c in corpora" :key="c.id">
				{{ c.id }}
				<router-link :to="{ name: 'tagset builder', params: { corpus: c.id } }">go!</router-link>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import type { NormalizedIndexBase } from '@/types/apptypes';

import { useBlackLabApi } from '@/shared/api/index.ts';

const api = useBlackLabApi();
const loading = ref(false);
const error = ref<string | null>(null);
const corpora = ref<NormalizedIndexBase[]>([]);

async function load() {
	if (loading.value) return;
	loading.value = true;
	error.value = null;
	try {
		corpora.value = await api.getCorpora();
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e);
	} finally {
		loading.value = false;
	}
}

void load();
</script>
