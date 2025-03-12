<template>
	<div id="formats-all-container" class="cf-panel cf-panel-lg">
		<Spinner v-if="loading" class="lg overlay"/>
		<h2>Your import formats</h2>
		<table class="table corpora">
			<thead>
				<tr>
					<th>Id</th>
					<th>Name</th>
					<th class="table-icon"></th>
					<th class="table-icon"></th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="f in formats">
					<td>{{f.shortId}}</td>
					<td>{{f.displayName}}</td>
					<td><a role="button" class="fa fa-fw fa-pencil" :title="`Edit format '${f.displayName}'`" @click="$emit('edit', f.id)"></a></td>
					<td><a role="button" class="fa fa-fw fa-trash" :title="`Delete format '${f.displayName}'`" @click="$emit('delete', f.id)"></a></td>
				</tr>
			</tbody>
		</table>
		<button type="button" class="btn btn-lg btn-default" @click="$emit('create')">New format</button>
	</div>
</template>

<script lang="ts">
import { NormalizedFormat } from '@/types/apptypes';
import Vue from 'vue';
import Spinner from '@/components/Spinner.vue';
export default Vue.extend({
	components: {Spinner},
	props: {
		formats: Array as () => NormalizedFormat[],
		loading: Boolean
	},
})
</script>

<style>
th.table-icon {
	width: 1px; /* just scale to content. */
}
</style>