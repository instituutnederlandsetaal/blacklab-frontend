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
					<tr v-for="({ entry, grouping }, index) in recentHistory" :key="entry.hash + (entry.interface.viewedResults || '')">
						<td>
							<strong>{{ index + 1 }}.</strong>
						</td>
						<td class="text-muted" style="padding-left: 0">
							<small>{{
								new Date(entry.timestamp).toLocaleString('nl-NL', {
									hour12: false,
									//year: '2-digit',
									month: '2-digit',
									day: '2-digit',
									hour: 'numeric',
									minute: 'numeric',
								})
							}}</small>
						</td>
						<td>{{ entry.interface.viewedResults === 'hits' ? 'Hits' : entry.interface.viewedResults === 'docs' ? 'Documents' : entry.interface.viewedResults }}</td>
						<td class="history-table-contain-text" :title="entry.displayValues.pattern.substring(0, 1000) || undefined">{{ entry.displayValues.pattern }}</td>
						<td class="history-table-contain-text" :title="entry.displayValues.filters.substring(0, 1000) || undefined">{{ entry.displayValues.filters }}</td>
						<td class="history-table-contain-text" :title="grouping">{{ grouping }}</td>
						<td>
							<div class="btn-group">
								<button type="button" class="btn btn-default" @click="load(entry)">{{ $t('history.search') }}</button>
								<button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown"><span class="caret" /></button>
								<ul class="dropdown-menu dropdown-menu-right">
									<li>
										<a role="button" @click.prevent="openShareUrl(entry)">{{ $t('history.copyAsLink') }}</a>
									</li>
									<li>
										<a role="button" @click.prevent="downloadAsFile(entry)">{{ $t('history.downloadAsFile') }}</a>
									</li>
									<li>
										<a role="button" @click.prevent="HistoryStore.actions.removeEntry(index)">{{ $t('history.delete') }}</a>
									</li>
									<li>
										<a role="button" @click.prevent="clearHistoryVisible = true">{{ $t('history.deleteAll') }}</a>
									</li>
								</ul>
							</div>
						</td>
					</tr>
				</tbody>
			</table>
			<button v-if="recentHistory.length < history.length" type="button" class="btn btn-default" @click="shownOlderEntries += 5">{{ $t('history.loadMore') }}</button>

			<form v-if="sharingUrl != null" class="history-popup" @click.self="closeShareUrl">
				<div class="history-popup-content modal-content">
					<input type="text" class="form-control" :value="sharingUrl" autocomplete="off" autofocus readonly ref="shareUrlInput" />
				</div>
			</form>

			<Modal
				v-if="clearHistoryVisible"
				:title="$t('history.clearSearchHistory')"
				:closeMessage="$t('history.cancel')"
				:confirmMessage="$t('history.clear')"
				@confirm="clearHistory"
				@close="clearHistoryVisible = false"
				auto
			>
				{{ $t('history.clearSearchHistoryConfirmation') }}
			</Modal>
		</template>
		<template #footer>
			<form v-if="importUrlVisible" @submit.prevent.stop="importFromUrl" :name="`${uid}_import`" class="history-table-import-url">
				<div class="input-group" style="width: 100%">
					<input type="url" class="form-control" autocomplete="off" autofocus :placeholder="$t('history.copyUrlHere')" ref="importUrlInput" />
					<span class="input-group-btn"
						><button type="submit" class="btn btn-primary">{{ $t('history.importUrl') }}</button></span
					>
				</div>
				<div v-if="importUrlError" class="text-danger">{{ importUrlError }}</div>
			</form>
			<button v-else class="btn btn-link btn-open-import" @click="importUrlVisible = !importUrlVisible"><span class="fa fa-lg fa-plus"></span> {{ $t('history.importFromLink') }}</button>
		</template>
	</Modal>
</template>

<script setup lang="ts">
import URI from 'urijs';
import { computed, nextTick, ref, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';

import * as RootStore from '@/app/state/root-store';
import { useCorpus } from '@/app/state/useCorpusContext';
import { useCustomizations } from '@/customization-api/internal/internal-api';
import * as HistoryStore from '@/features/history/model/query-history-state';
import UrlStateParserSearch, { createUrlStateParserSearchDependencies } from '@/url/url-state-parser-search';
import { humanizeSerializedGroupBy } from '@/utils/grouping';

import { useBlackLabApi } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import useUid from '@/shared/utils/uid';

import Modal from '@/shared/ui/Modal.vue';

function toRouterPath(url: string): string {
	const relativeUrl = new URI(url).host('').protocol('').port('').toString();
	const context = (CONTEXT_URL || '').replace(/\/+$/, '');
	return !context || !relativeUrl.startsWith(context) ? relativeUrl : relativeUrl.slice(context.length) || '/';
}

const emit = defineEmits<{ close: [] }>();
const router = useRouter();
const blacklab = useBlackLabApi();
const corpus = useCorpus();
const customizations = useCustomizations();
const translate = useI18n();
const importUrlInput = useTemplateRef<HTMLInputElement>('importUrlInput');
const shareUrlInput = useTemplateRef<HTMLInputElement>('shareUrlInput');

const sessionStart = Date.now();
const shownOlderEntries = ref(0);
const sharingUrl = ref<string | null>(null);
const importUrlError = ref<string | null>(null);
const importUrlVisible = ref(false);
const clearHistoryVisible = ref(false);
const uid = useUid();
const history = computed(HistoryStore.getState);
const recentHistory = computed(() => {
	let olderEntryCount = 0;
	return history.value
		.filter((entry, index) => entry.timestamp >= sessionStart || olderEntryCount++ < shownOlderEntries.value || index < 2)
		.map(entry => ({ entry, grouping: humanizeSerializedGroupBy(translate, entry.view.groupBy, corpus.value.allAnnotationsMap, corpus.value.allMetadataFieldsMap).join(' ') || '-' }));
});

async function openShareUrl(entry: HistoryStore.FullHistoryEntry) {
	sharingUrl.value = entry.url;
	await nextTick();
	shareUrlInput.value?.focus();
	shareUrlInput.value?.select();
}

function closeShareUrl() {
	sharingUrl.value = null;
}

/** Keep file-saver out of the initial page bundle. */
function downloadAsFile(entry: HistoryStore.FullHistoryEntry) {
	const { file, fileName } = HistoryStore.get.asFile(entry);
	import('file-saver').then(({ saveAs }) => saveAs(file, fileName));
}

async function load(entry: HistoryStore.HistoryEntry | HistoryStore.FullHistoryEntry) {
	if ('url' in entry && entry.url) await router.push(toRouterPath(entry.url));
	else RootStore.actions.replace(entry);
	emit('close');
}

async function importFromUrl() {
	const input = importUrlInput.value!;
	const importUrl = input.value;
	if (!importUrl) {
		importUrlError.value = null;
		importUrlVisible.value = false;
	}
	if (!input.checkValidity()) {
		importUrlError.value = 'Invalid url';
		return;
	}

	const uri = new URI(importUrl);
	const entry = await new UrlStateParserSearch(createUrlStateParserSearchDependencies({ blacklabApi: blacklab, corpus: corpus.value, customizations }), uri).get();
	HistoryStore.actions.addEntry({ entry, pattern: (uri.query(true) as { patt?: string }).patt, url: importUrl });
	importUrlError.value = null;
	importUrlVisible.value = false;
}

function clearHistory() {
	HistoryStore.actions.clear();
	clearHistoryVisible.value = false;
}
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
	td,
	th {
		white-space: nowrap;
	}
	.history- {
		&index {
			display: table-cell;
		}
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
	background-color: rgba(0, 0, 0, 0.25);
	z-index: 10000;
	> .history-popup-content {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		max-width: 1170px;
		width: 80%;
		background: white;
		border-radius: 6px;

		> .history-popup-header {
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
