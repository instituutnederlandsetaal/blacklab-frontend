<template>
	<ServerRenderedComponent :content="content"/>
</template>

<script lang="ts">
import { frontend } from '@/api';
import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';
import * as CorpusStore from '@/store/corpus';
import { loadableFromStream, type LoadableFromStream } from '@/utils/loadable-streams';
import { defineComponent } from 'vue';

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