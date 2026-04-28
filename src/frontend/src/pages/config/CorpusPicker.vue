<template>
	<div class="container">
		<template v-if="loading">
			<span class="fa fa-spinner fa-spin fa-4x"></span>
			LOADING
		</template>
		<div v-else-if="error">{{error}} <button type="button" @click="load">try again</button></div>
		<template v-else>
			<div v-for="c in corpora" :key="c.id">
				{{c.id}}
				<router-link :to="{name: 'corpus', params: {id: c.id}}">go!</router-link>
			</div>
		</template>
	</div>
</template>

<script lang="ts">
import { blacklab } from '@/_new/shared/api';
import type { NormalizedIndex, NormalizedIndexBase } from '@/types/apptypes';
import { defineComponent } from 'vue';

import CorpusConfig from './CorpusConfig.vue';

export default defineComponent({
	components: {
		CorpusConfig,
	},
	data: () => ({
		loading: false,
		error: null as null|string,
		corpora: null as null|NormalizedIndexBase[],
		corpus: null as null|NormalizedIndex
	}),
	methods: {
		load() {
			if (this.loading) { return; }
			this.loading = true;

			blacklab.getCorpora()
			.then(c => this.corpora = c)
			.catch(e => this.error = e.message)
			.finally(() => this.loading = false);
		},
	},
	created() {
		this.load();
	}
})
</script>