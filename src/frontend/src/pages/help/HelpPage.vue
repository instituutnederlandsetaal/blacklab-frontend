<template>
	<ServerRenderedComponent :content="content"/>
</template>

<script lang="ts">
import Vue from 'vue';

import { frontend } from '@/api';
import * as CorpusStore from '@/store/corpus';
import { LoadableFromStream } from '@/utils/loadable-streams';

import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';

export default Vue.extend({
	components: {
		ServerRenderedComponent
	},
	computed: {
		content(): LoadableFromStream<string> {
			// dispose shouldn't be necessary, web requests always complete eventually.
			return new LoadableFromStream(frontend.getHelp(CorpusStore.get.indexId() ?? undefined).toObservable());
		},
	},
});
</script>

<style scoped>
/* Add your styles here */
</style>