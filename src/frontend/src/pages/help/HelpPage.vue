<template>
	<ServerRenderedComponent :content="content"/>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import { frontend } from '@/api';
import * as CorpusStore from '@/store/corpus';
import { loadableFromStream } from '@/utils/loadable-streams';

import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';

export default defineComponent({
	components: {
		ServerRenderedComponent
	},
	computed: {
		content(): LoadableFromStream<string> {
			// dispose shouldn't be necessary, web requests always complete eventually.
			return loadableFromStream(frontend.getHelp(CorpusStore.get.indexId() ?? undefined).toObservable());
		},
	},
});
</script>

<style scoped>
/* Add your styles here */
</style>