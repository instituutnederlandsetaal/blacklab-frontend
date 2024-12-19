<template>
	<div id="app">
		<Spinner v-if="loading"/>
		<div v-else-if="error">
			<h2>
				<span class="fa fa-danger fa-4x"></span>
				{{ error }}
			</h2>
		</div>
		<router-view v-else/>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import * as RootStore from '@/store/index';

import Spinner from '@/components/Spinner.vue';

import { init as initApi } from '@/api';
import * as loginSystem from '@/utils/loginsystem';
import UrlStateParser from '@/store/util/url-state-parser';

import * as FilterStore from '@/store/form/filters';
import connectStreamsToVuex from '@/store/streams';

import router from '@/router';
import {i18n} from '@/utils/i18n';

export default Vue.extend({
	router,
	i18n,
	components: {
		Spinner
	},
	data: () => ({
		loading: true,
		error: null as string | null
	}),
	async mounted() {
		// we do this after render, so the user has something to look at while we're loading.
		const user = await loginSystem.awaitInit(); // LOGIN SYSTEM
		initApi('blacklab', BLS_URL, user);
		initApi('cf', CONTEXT_URL, user);

		// await runHook('beforeStoreInit');
		const success = await RootStore.init();
		if (!success) {
			this.error = 'Failed to initialize the store';
			return;
		}
		if (RootStore.getState().corpus.corpus) {
			// await runHook('beforeStateLoaded')
			const stateFromUrl = await new UrlStateParser(FilterStore.getState().filters).get();
			RootStore.actions.replace(stateFromUrl);
			// Don't do this before the url is parsed, as it controls the page url (among other things derived from the state).
			connectStreamsToVuex();
		}

		this.loading = false;
	}
})
</script>

<style lang="scss">

</style>