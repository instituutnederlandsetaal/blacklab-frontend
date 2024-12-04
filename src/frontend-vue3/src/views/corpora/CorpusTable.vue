<template>

	<div class="cf-panel cf-panel-lg" style="position: relative; min-height: 150px; display: block;">
		<Spinner v-if="loading" class="overlay"/>
		<h2>{{ title }}</h2>
		<table class="corpora public table">
			<thead>
				<tr>
					<th class="table-icon"></th>
					<th>Corpus</th>
					<th>Size</th>
					<th class="table-icon"></th>
					<th v-if="isPrivate" class="table-icon"></th>
					<th v-if="isPrivate" class="table-icon"></th>
					<th v-if="isPrivate" class="table-icon"></th>
				</tr>
			</thead>
			<tbody><template v-for="corpus in withExtraInfo">
				<tr>
					<td>
						<RouterLink :title="`Search the '${corpus.displayName}' corpus`" :class="`icon fa fa-search ${!corpus.canSearch ? 'disabled' : ''}`" :to="getRouteTo.search(corpus.id)"/>
							
							<!-- corpus.canSearch ? corpus.searchUrl : undefined"></RouterLink> -->
						<!-- <a :title="`Search the '${corpus.displayName}' corpus`" :class="`icon fa fa-search ${!corpus.canSearch ? 'disabled' : ''}`" :href="corpus.canSearch ? corpus.searchUrl : undefined"></a> -->
					
					</td>
					<td class="corpus-name"><a :title="`Search the '${corpus.displayName}' corpus`" :class="`${!corpus.canSearch ? 'disabled' : ''}`" :href="corpus.canSearch ? corpus.searchUrl : undefined">{{corpus.displayName}} {{corpus.statusText}}</a></td>
					<td>{{corpus.sizeString}}</td>
					<template v-if="isPrivate">
						<td><a role="button" :title="`Upload documents to the '${corpus.displayName}' corpus`" :class="`icon fa fa-fw fa-cloud-upload ${!corpus.canIndex? 'disabled' : ''}`" @click="$emit('upload', corpus.id)"></a></td>
						<td><a role="button" :title="`Share the '${corpus.displayName}' corpus`" class="icon fa fa-fw fa-user-plus" @click="$emit('share', corpus.id)"></a></td>
						<td><a role="button" :title="`Delete the '${corpus.displayName}' corpus`" :class="`icon fa fa-fw fa-trash ${!corpus.canIndex ? 'disabled' : ''}`" @click="$emit('delete', corpus.id)"></a></td>
					</template>
					<td><a role="button" @click="details[corpus.id] = !details[corpus.id]"><span class="icon fa fa-fw fa-caret-down" title="show details"></span></a></td>
				</tr>
				<tr v-if="details[corpus.id]">
					<td :colspan="isPrivate ? 7 : 4">
						<table><tbody>
							<tr :title="corpus.timeModifiedFull">
								<th>Last modified</th>
								<td>{{corpus.timeModified}}</td>
							</tr>
							<!-- If the corpus has a format and the format is in the list, corpus.format != null, and the format is ours. (blacklab only returns our own formats.) -->
							<tr v-if="isPrivate">
								<th>Format</th>
								<td :title="(corpus.format && corpus.format.owner) ? 'Format owned by ' + corpus.format.owner : ''">{{(corpus.format && corpus.format.owner) ? '*' : ''}}{{corpus.format ? corpus.format.shortId : corpus.documentFormat}}</td>
							</tr>
							<tr>
								<th>Description</th>
								<td>{{corpus.description || 'No description'}}</td>
							</tr>
							<tr>
								<th>Documents</th>
								<td>{{corpus.documentCount.toLocaleString()}}</td>
							</tr>
							<tr>
								<th>Tokens</th>
								<td>{{corpus.tokenCount.toLocaleString()}}</td>
							</tr>
						</tbody></table>
					</td>
				</tr>
			</template></tbody>
		</table>
		<div v-if="isPrivate">
			<button v-if="canCreateCorpus" class="btn btn-default btn-lg" id="create-corpus" type="button" @click="$emit('create')">New corpus</button>
			<div v-else class="text-danger" style="padding-left: 8px;"><em>You have reached the private corpora limit.<br>You will have to delete one of your corpora before you may create another.</em></div>
		</div>
	</div>

</template>

<script lang="ts">
import {defineComponent} from 'vue';
import {Spinner} from 'int-components';
import type { NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';
import { getRouteTo } from '@/router';

type IndexWithExtraInfo = NormalizedIndexBase&{
	canSearch: boolean,
	canIndex: boolean,
	format: NormalizedFormat|undefined,
	searchUrl: string,
	sizeString: string,
	statusText: string,
	timeModified: string,
	timeModifiedFull: string
};

export default defineComponent({
	components: {Spinner},
	props: {
		corpora: {type: Array as () => NormalizedIndexBase[], required: true },
		formats: {type: Array as () => NormalizedFormat[], required: true },
		title: String,
		isPrivate: Boolean,
		canCreateCorpus: Boolean,
		loading: Boolean
	},
	data: () => ({
		details: {} as Record<string, boolean>,
		getRouteTo,
	}),
	computed: {
		withExtraInfo(): IndexWithExtraInfo[] {
			// generate some data we need for rendering
			return this.corpora.map<IndexWithExtraInfo>(corpus => {
				let statusText: string = corpus.status;
				if (statusText === 'indexing') {
					statusText = ' (indexing) - ' + corpus.indexProgress!.filesProcessed + ' files, ' +
						corpus.indexProgress!.docsDone + ' documents, and ' +
						corpus.indexProgress!.tokensProcessed + ' tokens indexed so far...';
				} else if (corpus.status !== 'available') {
					statusText = ' (' + statusText + ')';
				} else  {
					statusText = '';
				}

				const format = this.formats.find(f => f.id === corpus.documentFormat)!;

				return {
					...corpus,
					canSearch: corpus.status === 'available',
					canIndex: corpus.status !== 'indexing' && corpus.status !== 'opening',
					format,
					searchUrl: CONTEXT_URL + '/' + corpus.id + '/search/',
					sizeString: this.abbrNumber(corpus.tokenCount),
					statusText,
					timeModified: this.dateOnly(corpus.timeModified),
					timeModifiedFull: corpus.timeModified
				};
			});
		}
	},
	methods: {
		// 2695798 becomes 2,6M, etc.
		abbrNumber(n: number|null|undefined) {
			if (n == null) {
				return '';
			}
			let unit = '';
			if (n >= 1e9) {
				n = Math.round(n / 1e8) / 10;
				unit = 'G';
			} else if (n >= 1e6) {
				n = Math.round(n / 1e5) / 10;
				unit = 'M';
			} else if (n >= 1e3) {
				n = Math.round(n / 1e2) / 10;
				unit = 'K';
			}
			return String(n).replace(/\./, ',') + unit;
		},
		// Return only the date part of a date/time string,
		// and flip it around, e.g.:
		// "1970-02-01 00:00:00" becomes "01-02-1970"
		dateOnly(dateTimeString: string) {
			if (dateTimeString) {
				return dateTimeString.replace(/^(\d+)-(\d+)-(\d+) .*$/, '$3-$2-$1');
			} else {
				return '01-01-1970';
			}
		}
	}
})
</script>