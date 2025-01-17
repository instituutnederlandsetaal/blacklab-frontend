<template>
	<ServerRenderedComponent :content="content"/>
</template>

<script lang="ts">
import Vue from 'vue';
import { pipe, switchMap } from 'rxjs';

import { frontend } from '@/api';
import * as CorpusStore from '@/store/corpus';
import { InteractiveLoadable, isEmpty, isLoaded, toObservable } from '@/utils/loadable-streams';

import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';

export default Vue.extend({
	components: {
		ServerRenderedComponent
	},
	data: () => ({
		content: new InteractiveLoadable<string|undefined, string>(pipe(
			switchMap(corpusIdOrBlank => toObservable(frontend.getHelp(corpusIdOrBlank))),
		))
	}),
	computed: {
		corpus: () => CorpusStore.getState()
	},
	watch: {
		corpus: {
			immediate: true,
			handler(corpus: CorpusStore.ModuleRootState) {
				if (isLoaded(corpus)) this.content.next(corpus.value.id);
				else if (isEmpty(corpus)) this.content.next(undefined);
			}
		}
	}
});
</script>

<style scoped>
/* Add your styles here */
</style>