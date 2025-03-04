<template>
	<Modal :title="$t('history.heading')" :closeMessage="$t('history.close')" :confirm="false" @close="$emit('close')" auto>
		<template #body>
			<table class="table table-hover history-table">
				<thead>
					<tr>
						<th width="30px">#</th>
						<th width="80px"></th>
						<th width="80px">{{ $t('history.results') }}</th>
						<th>{{ $t('history.pattern') }}</th>
						<th>{{ $t('history.filters') }}</th>
						<th>{{ $t('history.grouping') }}</th>
						<th width="115px"></th>
					</tr>
				</thead>
				<tbody>
					<tr v-for="(entry, index) in recentHistory" :key="entry.hash + (entry.interface.viewedResults || '')">
						<td><strong>{{index + 1}}.</strong></td>
						<td class="text-muted" style="padding-left:0;"><small>{{new Date(entry.timestamp).toLocaleString('nl-NL', {
							hour12: false,
							//year: '2-digit',
							month: '2-digit',
							day: '2-digit',
							hour: 'numeric',
							minute: 'numeric'
						})}}</small></td>
						<td>{{
							entry.interface.viewedResults === 'hits' ? 'Hits' :
							entry.interface.viewedResults === 'docs' ? 'Documents' :
							entry.interface.viewedResults
						}}</td>
						<td class="history-table-contain-text" :title="entry.displayValues.pattern.substring(0,1000) || undefined">{{entry.displayValues.pattern}}</td>
						<td class="history-table-contain-text" :title="entry.displayValues.filters.substring(0,1000) || undefined">{{entry.displayValues.filters}}</td>
						<td class="history-table-contain-text" :title="entry.view.groupBy.join(' ') || '-'">{{entry.view.groupBy.join(' ') || '-'}}</td>
						<td>
							<div class="btn-group">
								<button type="button" class="btn btn-default" @click="load(entry)">{{ $t('history.search') }}</button>
								<button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown"><span class="caret"/></button>
								<ul class="dropdown-menu dropdown-menu-right">
									<li><a role="button" @click.prevent="openShareUrl(entry)">{{ $t('history.copyAsLink') }}</a></li>
									<li><a role="button" @click.prevent="downloadAsFile(entry)">{{ $t('history.downloadAsFile') }}</a></li>
									<li><a role="button" @click.prevent="remove(index)">{{ $t('history.delete') }}</a></li>
									<li><a role="button" @click.prevent="clearHistoryVisible = true">{{ $t('history.deleteAll') }}</a></li>
								</ul>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
			<button v-if="recentHistory.length < history.length" type="button" class="btn btn-default" @click="shownOlderEntries+=5">{{ $t('history.loadMore') }}</button>


			<form v-if="isSharingUrl" class="history-popup" @click.self="closeShareUrl">
				<div class="history-popup-content modal-content">
					<input type="text" class="form-control" :value="sharingUrl" autocomplete="off" autofocus readonly ref="shareUrlInput"/>
				</div>
			</form>

			<Modal v-if="clearHistoryVisible"
				:title="$t('history.clearSearchHistory')"
				:closeMessage="$t('history.cancel')"
				:confirmMessage="$t('history.clear')"
				@confirm="clearHistory"
				@close="clearHistoryVisible=false"
				auto
			>
				{{ $t('history.clearSearchHistoryConfirmation') }}
			</Modal>
		</template>
		<template #footer>
			<form v-if="importUrlVisible" @submit.prevent.stop="importFromUrl" :name="`${uid}_import`" class="history-table-import-url">
				<div class="input-group" style="width: 100%;">
					<input type="url" class="form-control" autocomplete="off" autofocus :placeholder="$t('history.copyUrlHere')" ref="importUrlInput"/>
					<span class="input-group-btn"><button type="submit" class="btn btn-primary">{{ $t('history.importUrl') }}</button></span>
				</div>
				<div v-if="importUrlError" class="text-danger">{{importUrlError}}</div>
			</form>
			<button v-else class="btn btn-link btn-open-import" @click="importUrlVisible = !importUrlVisible"><span class="fa fa-lg fa-plus"></span> {{ $t('history.importFromLink') }}</button>

		</template>
	</Modal>
</template>

<script lang="ts">
import Vue from 'vue';
import URI from 'urijs';
import $ from 'jquery';

import {saveAs} from 'file-saver';

import * as RootStore from '@/store/search/';
import * as HistoryStore from '@/store/search/history';
import * as FilterStore from '@/store/search/form/filters';

import UrlStateParser from '@/store/search/util/url-state-parser';

import Modal from '@/components/Modal.vue';

import uid from '@/mixins/uid';

export default Vue.extend({
	components: {
		Modal,
	},
	data: () => ({
		sessionStart: new Date().getTime(),
		shownOlderEntries: 0,
		sharingUrl: null as null|string,
		importUrlError: null as null|string,
		importUrlVisible: false,
		clearHistoryVisible: false,
		uid: uid()
	}),
	computed: {
		history(): HistoryStore.ModuleRootState { return HistoryStore.getState() },
		recentHistory(): HistoryStore.ModuleRootState {
			let olderEntryCount = 0;
			return this.history.filter((e: HistoryStore.FullHistoryEntry, i) => (e.timestamp >= this.sessionStart) || (olderEntryCount++) < this.shownOlderEntries || i < 2);
		},
		isSharingUrl(): boolean { return this.sharingUrl != null; },
	},

	methods: {
		remove(index: number): void { HistoryStore.actions.removeEntry(index); },
		openShareUrl(entry: HistoryStore.FullHistoryEntry) { this.sharingUrl = entry.url; },
		closeShareUrl() { this.sharingUrl = null; },

		downloadAsFile(entry: HistoryStore.FullHistoryEntry) {
			const {file, fileName} = HistoryStore.get.asFile(entry);
			saveAs(file, fileName);
		},

		load(entry: HistoryStore.HistoryEntry) {
			// @ts-ignore
			$(this.$refs.modal).modal('toggle');
			RootStore.actions.replace(entry);
		},

		async importFromUrl() {
			const input = (this.$refs.importUrlInput as HTMLInputElement);
			const importUrl = input.value;
			if (!importUrl) {
				this.importUrlError = null;
				this.importUrlVisible = false;
			}
			if (!input.checkValidity()) {
				this.importUrlError = 'Invalid url';
				return;
			}

			const uri = new URI(importUrl);
			const state = await new UrlStateParser(FilterStore.getState().filters, uri).get();
			HistoryStore.actions.addEntry({
				entry: state,
				pattern: (uri.query(true) as any).patt,
				url: importUrl,
			});

			this.importUrlError = null;
			this.importUrlVisible = false;
		},
		clearHistory() {
			HistoryStore.actions.clear();
			this.clearHistoryVisible = false;
		}
	},
	watch: {
		isSharingUrl(value: boolean) {
			if (value) {
				Vue.nextTick(() => {
					const input = (this.$refs.shareUrlInput as HTMLInputElement);
					input.focus();
					input.setSelectionRange(0, input.value.length);
				});
			}
		}
	}
});
</script>

<style lang="scss">

#history {

	.modal-footer {
		display: flex;

		justify-content: flex-end;
		// align-items: flex-start;
		// justify-content: space-between;

		.history-table-import-url {
			flex-grow: 1;
			margin-right: 25px;
		}
	}

	.modal-body {
		padding-bottom: 110px; // space for dropdown menu
	}
}

.history-table {
	margin: 0;
	min-width: 500px;
	td, th {
		white-space: nowrap;
	}
	.history-{
		&index { display: table-cell; }
		&date {
			display: table-cell;
			text-align: right;
			width: 100%;
		}
	}
}

.history-table-contain-text {
	white-space: nowrap;
	text-overflow: ellipsis;
	overflow: hidden;
}

.history-popup {
	position: fixed;
	top: 0;
	bottom: 0;
	left: 0;
	right: 0;
	background-color: rgba(0,0,0,0.25);
	z-index: 10000;
	>.history-popup-content {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-width: 1170px;
		width: 80%;
		background: white;
		border-radius: 6px;

		>.history-popup-header {
			text-align: right;
		}
	}
}

.btn-open-import {
	padding-left: 6px;
	padding-right: 6px;
	width: 100%;
	text-align: left;
}

.history-dropdown {
	> .dropdown-menu {
		left: auto;
		right: 0;
	}
}

</style>
