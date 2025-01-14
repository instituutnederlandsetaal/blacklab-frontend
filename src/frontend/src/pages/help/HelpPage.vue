<template>
	<ServerRenderedComponent :content="content"/>
</template>

<script lang="ts">
import Vue from 'vue';
import { pipe, switchMap } from 'rxjs';

import { frontend } from '@/api';
import * as RootStore from '@/store';
import { InteractiveLoadable, toObservable } from '@/utils/loadable-streams';

import ServerRenderedComponent from '@/components/ServerRenderedContentPage.vue';

export default Vue.extend({
	components: {
		ServerRenderedComponent
	},
	data: () => ({
		content: new InteractiveLoadable<string, string>(pipe(
			switchMap(corpusId => toObservable(frontend.getHelp(corpusId))),
		))
	}),
	computed: {
		corpusId: () => RootStore.getState().corpusId,
	},
	watch: {
		corpusId: {
			immediate: true,
			handler(corpusId: string) { this.content.next(corpusId); }
		}
	}

});
</script>

<style scoped>
/* Add your styles here */
</style>