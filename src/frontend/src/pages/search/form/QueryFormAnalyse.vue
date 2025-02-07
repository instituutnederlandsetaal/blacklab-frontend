<template>
	<div>
		<h3>{{$t('analyse.heading')}}</h3>
		<ul class="nav nav-tabs">
			<li :class="{'active': analyseMode==='topic'}"   @click.prevent="analyseMode='topic'"><a href="#analyse-topic">{{$t('analyse.topic.heading')}}</a></li>
			<li :class="{'active': analyseMode==='collocation'}"   @click.prevent="analyseMode='collocation'"><a href="#analyse-collocation">{{$t('analyse.collocation.heading')}}</a></li>
			<li :class="{'active': analyseMode==='cooccur'}"   @click.prevent="analyseMode='cooccur'"><a href="#analyse-cooccur">{{$t('analyse.cooccur.heading')}}</a></li>
			<li :class="{'active': analyseMode==='wordlist'}"   @click.prevent="analyseMode='wordlist'"><a href="#analyse-wordlist">{{$t('analyse.wordlist.heading')}}</a></li>
			<li :class="{'active': analyseMode==='keyword'}"   @click.prevent="analyseMode='keyword'"><a href="#analyse-keyword">{{$t('analyse.keyword.heading')}}</a></li>
			<li :class="{'active': analyseMode==='network'}"   @click.prevent="analyseMode='network'"><a href="#analyse-network">{{$t('analyse.network.heading')}}</a></li>
		</ul>
		
		<div class="tab-content">
			<div id="analyse-topic" v-if="analyseMode==='topic'">
				<QueryFormTopic />
			</div>
			<div id="analyse-collocation" v-if="analyseMode==='collocation'">
				<QueryFormCollo />
			</div>
			<div id="analyse-cooccur" v-if="analyseMode==='cooccur'">
				<QueryFormCooccur />
			</div>
			<div id="analyse-wordlist" v-if="analyseMode==='wordlist'">
				<QueryFormWordlist />
			</div>
			<div id="analyse-keyword" v-if="analyseMode==='keyword'">
				<QueryFormKeyword />
			</div>
			<div id="analyse-network" v-if="analyseMode==='network'">
				<QueryFormNetwork />
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as InterfaceStore from '@/store/search/form/interface';
import QueryFormTopic from '@/pages/search/form/analyse/QueryFormTopic.vue';
import QueryFormCollo from '@/pages/search/form/analyse/QueryFormCollo.vue';
import QueryFormCooccur from '@/pages/search/form/analyse/QueryFormCooccur.vue';
import QueryFormWordlist from '@/pages/search/form/analyse/QueryFormWordlist.vue';
import QueryFormKeyword from '@/pages/search/form/analyse/QueryFormKeyword.vue';
import QueryFormNetwork from '@/pages/search/form/analyse/QueryFormNetwork.vue';
import * as RootStore from '@/store/search/';

import debug from '@/utils/debug';

export default Vue.extend({
	components: {
		QueryFormTopic,
		QueryFormCollo,
		QueryFormCooccur,
		QueryFormWordlist,
		QueryFormKeyword,
		QueryFormNetwork,
	},
	data: () => ({
		debug
	}),
	computed: {
		analyseMode: {
			get(): string { return InterfaceStore.getState().analyseMode; },
			set: InterfaceStore.actions.analyseMode,
		},
	},
	methods: {
		reset: RootStore.actions.reset,		
	}
});
</script>

<style lang="scss">

</style>
