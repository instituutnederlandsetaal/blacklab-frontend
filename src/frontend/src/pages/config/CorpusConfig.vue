<template>
	<div>
		<div>
			<ul class="nav nav-tabs">
				<li v-for="tab in tabs" :class="{ active: activeTab === tab }" :key="tab">
					<router-link :to="{ name: tab, params: { corpus: index.id } }">{{ tab }}</router-link>
				</li>
			</ul>
		</div>

		<router-view :index="index" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { useCorpus } from '@/app/state/useCorpusContext';

const route = useRoute();
const tabs = ['tagset builder', 'interface'];
const activeTab = computed(() => route.name);
const index = useCorpus();
</script>
