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
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';

import { usePageBootstrap } from '@/app/router/page-bootstrap';
import { useCorpus } from '@/features/corpus/corpus-context';

const route = useRoute();
const tabs = ['tagset builder', 'interface'];
const activeTab = computed(() => route.name);
const index = useCorpus();
const pageBootstrap = usePageBootstrap();
onMounted(() => pageBootstrap.markContentReady());
</script>
