<template>
	<div id="formats-all-container" class="panel panel-default">
		<Spinner v-if="loading" class="lg overlay" />
		<div class="panel-heading"><h2 class="panel-title">Your import formats</h2></div>
		<div class="panel-body">
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
						<td>{{ f.shortId }}</td>
						<td>{{ f.displayName }}</td>
						<td>
							<a role="button" class="fa fa-fw fa-pencil" :title="`Edit format '${f.displayName}'`" @click="$emit('edit', f.id)"></a>
						</td>
						<td>
							<a role="button" class="fa fa-fw fa-trash" :title="`Delete format '${f.displayName}'`" @click="$emit('delete', f.id)"></a>
						</td>
					</tr>
				</tbody>
			</table>
			<button type="button" class="btn btn-lg btn-default" @click="$emit('create')">New format</button>
		</div>
	</div>
</template>

<script lang="ts">
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

import type { NormalizedFormat } from '@/types/apptypes';

import Spinner from '@/shared/ui/Spinner.vue';

export default defineComponent({
	components: { Spinner },
	props: {
		formats: { type: Array as PropType<NormalizedFormat[]>, required: true },
		loading: Boolean,
	},
});
</script>

<style>
th.table-icon {
	width: 1px; /* just scale to content. */
}
</style>
