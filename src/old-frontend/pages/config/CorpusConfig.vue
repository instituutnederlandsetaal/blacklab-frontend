<template>
	<div>
		<div>
			<ul class="nav nav-tabs">
				<li v-for="tab in tabs"
					:class="{active: activeTab === tab}"
					:key="tab"
				>
					<router-link :to="{name: tab, params: {id}}">{{tab}}</router-link>
				</li>
			</ul>
		</div>

		<span v-if="loading" class="fa fa-spinner fa-spin fa-4x"></span>
		<router-view v-else :index/>
	</div>
</template>

<script lang="ts">
import type { NormalizedIndex } from '@/types/apptypes';
import { defineComponent } from 'vue';

import POS from './POS.vue';

export default defineComponent({
	components: {
		POS
	},
	props: {
		id: { type: String, required: true },
		tabs: Array as () => string[],
		activeTab: String as () => string|undefined
	},
	data: () => ({
		index: null as null|NormalizedIndex,
		loading: false,
		error: null as null|string,
	}),
	computed: {

	},
	methods: {
		load() {
			this.loading = true;
			useBlackLabApi().getCorpus(this.id)
			.then(c => this.index = c)
			.catch(e => this.error = e.message)
			.finally(() => this.loading = false)
		}
	},
	created() {
		this.load();
	}
})
</script>