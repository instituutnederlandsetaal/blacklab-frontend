<template>
	<div class="cf-panel cf-panel-lg">
		<Spinner v-if="loading" overlay />
		<h2>{{ title }}</h2>
		<table class="corpora public table">
			<thead>
				<tr>
					<th class="table-icon"></th>
					<th>Corpus</th>
					<debug><th>ID [debug]</th></debug>
					<th>Size</th>
					<th class="table-icon"></th>
					<th v-if="isPrivate" class="table-icon"></th>
					<th v-if="isPrivate" class="table-icon"></th>
					<th v-if="isPrivate" class="table-icon"></th>
				</tr>
			</thead>
			<tbody>
				<template v-for="corpus in withExtraInfo">
					<tr>
						<td>
							<router-link
								:to="{ name: 'search', params: { corpus: corpus.id } }"
								:title="`Search the '${corpus.displayName}' corpus`"
								:class="`icon fa fa-search ${!corpus.canSearch ? 'disabled' : ''}`"
							></router-link>
						</td>
						<td class="corpus-name">
							<router-link :to="{ name: 'search', params: { corpus: corpus.id } }" :title="`Search the '${corpus.displayName}' corpus`" :class="`${!corpus.canSearch ? 'disabled' : ''}`"
								>{{ withExtraInfo.some(c => c.id !== corpus.id && c.displayName === corpus.displayName) ? `${corpus.displayName} (${corpus.id})` : corpus.displayName }}
								{{ corpus.statusText }}</router-link
							>
						</td>
						<debug
							><td>{{ corpus.id }}</td></debug
						>
						<td>{{ corpus.sizeString }}</td>
						<template v-if="isPrivate">
							<td>
								<a
									role="button"
									:title="`Upload documents to the '${corpus.displayName}' corpus`"
									:class="`icon fa fa-fw fa-cloud-upload ${!corpus.canIndex ? 'disabled' : ''}`"
									@click="emit('upload', corpus.id)"
								></a>
							</td>
							<td>
								<a role="button" :title="`Share the '${corpus.displayName}' corpus`" class="icon fa fa-fw fa-user-plus" @click="emit('share', corpus.id)"></a>
							</td>
							<td>
								<a role="button" :title="`Delete the '${corpus.displayName}' corpus`" :class="`icon fa fa-fw fa-trash ${!corpus.canIndex ? 'disabled' : ''}`" @click="emit('delete', corpus.id)"></a>
							</td>
						</template>
						<td>
							<a role="button" @click="details[corpus.id] = !details[corpus.id]"><span class="icon fa fa-fw fa-caret-down" title="show details"></span></a>
						</td>
					</tr>
					<tr v-if="details[corpus.id]">
						<td :colspan="(isPrivate ? 7 : 4) + (debugEnabled ? 1 : 0)">
							<table>
								<tbody>
									<tr :title="corpus.timeModified">
										<th>Last modified</th>
										<td>{{ dateOnly(corpus.timeModified) }}</td>
									</tr>
									<!-- If the corpus has a format and the format is in the list, corpus.format != null, and the format is ours. (blacklab only returns our own formats.) -->
									<tr v-if="isPrivate">
										<th>Format</th>
										<td :title="corpus.format && corpus.format.owner ? 'Format owned by ' + corpus.format.owner : ''">
											{{ corpus.format && corpus.format.owner ? '*' : '' }}{{ corpus.format ? corpus.format.shortId : corpus.documentFormat }}
										</td>
									</tr>
									<tr>
										<th>Description</th>
										<td>{{ corpus.description || 'No description' }}</td>
									</tr>
									<tr>
										<th>Documents</th>
										<td>{{ corpus.documentCount.toLocaleString() }}</td>
									</tr>
									<tr>
										<th>Tokens</th>
										<td>{{ corpus.tokenCount.toLocaleString() }}</td>
									</tr>
								</tbody>
							</table>
						</td>
					</tr>
				</template>
			</tbody>
		</table>
		<div v-if="isPrivate">
			<button v-if="canCreateCorpus" class="btn btn-default btn-lg" id="create-corpus" type="button" @click="emit('create')">New corpus</button>
			<div v-else class="text-danger" style="padding-left: 8px">
				<em>You have reached the private corpora limit.<br />You will have to delete one of your corpora before you may create another.</em>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';

import { type NormalizedFormat, type NormalizedIndexBase } from '@/types/apptypes';

import debugEnabled from '@/shared/debug/debug';

import Spinner from '@/shared/ui/Spinner.vue';

type IndexWithExtraInfo = NormalizedIndexBase & {
	canSearch: boolean;
	canIndex: boolean;
	format: NormalizedFormat | undefined;
	sizeString: string;
	statusText: string;
};

const props = defineProps<{
	corpora: NormalizedIndexBase[];
	formats: NormalizedFormat[];
	title?: string;
	isPrivate?: boolean;
	canCreateCorpus?: boolean;
	loading?: boolean;
}>();
const emit = defineEmits<{
	upload: [id: string];
	share: [id: string];
	delete: [id: string];
	create: [];
}>();
const details = reactive<Record<string, boolean>>({});

function abbrNumber(n: number | null | undefined) {
	if (n == null) return '';
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
}

/** Format a BlackLab timestamp as day-month-year. */
function dateOnly(dateTimeString: string) {
	return dateTimeString ? dateTimeString.replace(/^(\d+)-(\d+)-(\d+) .*$/, '$3-$2-$1') : '01-01-1970';
}

const withExtraInfo = computed<IndexWithExtraInfo[]>(() =>
	props.corpora.map(corpus => {
		let statusText: string = corpus.status;
		if (statusText === 'indexing') {
			statusText = ` (indexing) - ${corpus.indexProgress!.filesProcessed} files, ${corpus.indexProgress!.docsDone} documents, and ${corpus.indexProgress!.tokensProcessed} tokens indexed so far...`;
		} else {
			statusText = corpus.status === 'available' ? '' : ` (${statusText})`;
		}
		return {
			...corpus,
			canSearch: corpus.status === 'available',
			canIndex: corpus.status !== 'indexing' && corpus.status !== 'opening',
			format: props.formats.find(f => f.id === corpus.documentFormat),
			sizeString: abbrNumber(corpus.tokenCount),
			statusText,
		};
	}),
);
</script>

<style lang="scss">
th.table-icon {
	width: 1px; /* just scale to content. */
}

table.corpora {
	table-layout: auto;
	width: 100%;
	margin: 1em 0;
}

table.corpora td {
	font-size: 14pt;
	padding: 3px;
}

table.corpora th {
	font-size: 11pt;
	padding: 3px;
	background-color: inherit;
}
table.corpora table {
	width: auto;
}

table.corpora a.disabled {
	pointer-events: none;
	cursor: default;
	color: #bbb;
}

/* Don't change color when hovering over row (as in results table) */
table.corpora tr:hover {
	background-color: inherit;
}
col.corpus-name {
	width: 24%;
	outline: 1px solid red;
}
col.delete {
	width: 8%;
}

td.corpus-name a {
	color: inherit;
	text-decoration: none;
}
</style>
