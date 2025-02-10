<template>
	<ServerRenderedComponent :content="content"/>
</template>

<script lang="ts">
import Vue from 'vue';

import { frontend } from '@/api';
import * as CorpusStore from '@/store/corpus';
import { loadableFromObservable, toObservable } from '@/utils/loadable-streams';

import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';

export default Vue.extend({
	components: {
		ServerRenderedComponent
	},
	computed: {
		content() {
			return Vue.observable(loadableFromObservable(toObservable(frontend.getAbout(CorpusStore.get.indexId() ?? undefined)), []));
		},
	},
});
</script>

<style scoped>
/* Add your styles here */
</style>