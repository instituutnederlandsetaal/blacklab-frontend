<template>
	<router-view/>
</template>

<script lang="ts">
import Vue from 'vue';
import * as RootStore from '@/store/index';

import Spinner from '@/components/Spinner.vue';

import { init as initApi } from '@/api';
import * as loginSystem from '@/utils/loginsystem';
import UrlStateParserSearch from '@/url/url-state-parser-search';

import * as FilterStore from '@/store/form/filters';
import connectStreamsToVuex from '@/store/streams';

import router from '@/router';
import {i18n} from '@/utils/i18n';
import {store} from '@/store';
import * as CorpusStore from '@/store/corpus';
import { isError, isLoading } from '@/utils/loadable-streams';

export default Vue.extend({
	router,
	i18n,
	store,
	components: {
		Spinner
	},
	computed: {
		corpus: () => CorpusStore.getState()
	},
	async mounted() {
		// we do this after render, so the user has something to look at while we're loading.
		const user = await loginSystem.awaitInit();
		initApi('blacklab', BLS_URL, user);
		initApi('cf', CONTEXT_URL, user);

		// If we have a corpus: parse the url..
		// TODO this really shouldn't be here
		if (RootStore.getState().corpusId) {
			// AAAH!
			const corpus = await CorpusStore.get.loadingPromise();
			if (corpus) {
				// await runHook('beforeStateLoaded')
				const stateFromUrl = await new UrlStateParserSearch(FilterStore.getState().filters).get();
				RootStore.actions.replace(stateFromUrl);
			}
		}
		// connectStreamsToVuex();
	}
})
</script>

<style lang="scss">

</style>