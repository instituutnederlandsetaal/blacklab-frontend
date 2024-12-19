<template>
	<div style='text-align: left' v-if="settings">
		<div class='glossfields' style='text-align: center'>
			<GlossQueryField  v-for="(o,i) in gloss_fields" v-bind:key="i" :fieldDescription="o"/>
		</div>

		<button type="button" class="btn btn-default" @click="resetQuery">{{ $t('formConcept.glossSearch.reset') }}</button>

		<div>
			<label><input type="checkbox" v-model="showQuery"> {{ $t('formConcept.glossSearch.showQuery') }} </label>
			<div style="border: 1px solid black; margin-top: 1em; padding: 4pt" v-if="showQuery">
				JSON: <pre v-text="query_from_store"></pre>
				CQL: <pre v-text="query_cql_from_store"></pre>
				{{ $t('formConcept.glossSearch.settings') }}: <pre v-text="settings"></pre>
			</div>
		</div>

	</div>
</template>

<script lang="ts">

import Vue from 'vue';
import * as GlossStore from '@/store/form/glossStore';

import GlossQueryField from './GlossQueryField.vue'

export default Vue.extend ({
	components: { GlossQueryField },
	name: 'GlossSearch',
	props: {
		msg: String,
		src : String
	},

	data: () => ({
		debug: false,
		showQuery : false,
	}),

	methods : {
		resetQuery: GlossStore.actions.resetGlossQuery
	},
	computed : {
		settings: GlossStore.get.settings,
		gloss_fields() { return GlossStore.get.settings()?.gloss_fields },
		query_from_store() { return GlossStore.getState().gloss_query },
		query_cql_from_store() { return GlossStore.getState().gloss_query_cql },
	},
})

</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
	margin: 40px 0 0;
}
ul {
	list-style-type: none;
	padding: 0;
}
li {
	display: inline-block;
	margin: 0 10px;
}
a {
	color: #42b983;
}

img {
	width: 400px;
}

.boxes {
	display: flex
}

.glossfields {
	margin-bottom: 1em
}
.code {
		display: block;
		padding: 9.5px;
		margin: 0 0 10px;
		font-size: 13px;
		line-height: 1.42857143;
		color: #333;

		background-color: #f5f5f5;
		border: 1px solid #ccc;
		border-radius: 4px;
		font-family: Menlo,Monaco,Consolas,"Courier New",monospace;
}
</style>
