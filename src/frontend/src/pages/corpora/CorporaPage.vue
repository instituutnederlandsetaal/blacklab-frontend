<template>
	<div class="container">
		<Spinner v-if="loadingServerInfo" lg center />

		<div v-if="!loadingFormats && !loadingCorpora && !loadingServerInfo && !serverInfo && errorMessage" class="alert alert-danger">
			Error loading BlackLab info, try refreshing the page.
			<p>{{ errorMessage }}</p>
		</div>
		<div v-else-if="successMessage" class="alert alert-success">
			<a href="#" class="close" data-dismiss="alert" aria-label="close" @click="successMessage = ''">×</a>
			{{ successMessage }}
		</div>
		<div v-else-if="errorMessage" class="alert alert-danger">
			<a href="#" class="close" aria-label="close" @click="errorMessage = ''">×</a>
			{{ errorMessage }}
		</div>

		<template v-if="serverInfo">
			<div v-if="!publicCorpora.length && !loadingCorpora && !serverInfo.user.canCreateIndex" class="cf-panel cf-panel-lg">
				<h2>No corpora available</h2>
				<p>No corpora have been added to BlackLab. Corpora will appear here when when they become available.</p>
			</div>
			<CorpusTable v-if="publicCorpora.length" :loading="loadingCorpora" :corpora="publicCorpora" :formats="formats" title="Public corpora" />

			<!-- always shown if logged in -->
			<CorpusTable
				v-if="serverInfo.user.loggedIn"
				title="Your corpora"
				isPrivate
				:loading="loadingCorpora"
				:corpora="corpora.filter(c => c.owner)"
				:formats="formats"
				:canCreateCorpus="serverInfo.user.canCreateIndex"
				@share="doShareCorpus"
				@upload="doUploadCorpus"
				@delete="doDeleteCorpus"
				@create="doCreateCorpus"
			/>

			<FormatsTable v-if="serverInfo.user.loggedIn" :formats="privateFormats" :loading="loadingFormats" @create="doCreateFormat" @edit="doEditFormat" @delete="doDeleteFormat" />

			<!-- Modals -->
			<ModalCreateFormat v-if="modal === 'create-format'" :publicFormats="publicFormats" :privateFormats="privateFormats" :format="format" @create="refreshFormats" @success="success" @close="close" />
			<ModalCreateCorpus
				v-if="modal === 'create-corpus'"
				:publicFormats="publicFormats"
				:privateFormats="privateFormats"
				:loading="loadingFormats"
				:user="serverInfo.user"
				@create="refreshCorpora"
				@success="success"
				@error="error"
				@close="close"
			/>
			<ModalUpload v-if="modal === 'upload' && corpus" :corpus="corpus" :formats="formats" @indexing="refreshCorpus" @success="success" @close="close" />
			<ModalShareCorpus v-if="modal === 'share-corpus' && corpus" :corpus="corpus" @success="success" @close="close" />
			<Modal v-if="modal === 'confirm'" closeMessage="Cancel" confirmMessage="Delete" confirmClass="btn-danger" @confirm="confirmAction" @close="close">
				<template #title><h4 v-html="confirmTitle" class="modal-title"></h4></template>
				<p v-html="confirmMessage"></p>
			</Modal>
		</template>
	</div>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue';

import type { NormalizedBlacklabServer, NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';

import { useBlackLabApi } from '@/shared/api/index.ts';
import { ApiError, type CancelableRequest } from '@/shared/api/lib/api-types.ts';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';

import CorpusTable from './CorpusTable.vue';
import FormatsTable from './FormatsTable.vue';
import ModalCreateCorpus from '@/pages/corpora/ModalCreateCorpus.vue';
import ModalCreateFormat from '@/pages/corpora/ModalCreateFormat.vue';
import ModalShareCorpus from '@/pages/corpora/ModalShare.vue';
import ModalUpload from '@/pages/corpora/ModalUpload.vue';
import Modal from '@/shared/ui/Modal.vue';
import Spinner from '@/shared/ui/Spinner.vue';

type CorpusPoll = { displayName: string; request: CancelableRequest<NormalizedIndexBase> | null; timer: ReturnType<typeof setTimeout> | null };

const blacklab = useBlackLabApi();
const corpora = ref<NormalizedIndexBase[]>([]),
	formats = ref<NormalizedFormat[]>([]);
const serverInfo = shallowRef<NormalizedBlacklabServer>();
const errorMessage = ref(''),
	successMessage = ref(''),
	confirmMessage = ref(''),
	confirmTitle = ref('');
const confirmAction = shallowRef<(() => void) | undefined>();
const loadingCorpusMutation = ref(false),
	loadingFormatMutation = ref(false),
	loadingServerInfo = ref(false);
const modal = ref(''),
	indexId = ref<string | null>(null),
	formatId = ref<string | null>(null);
const corpusPolls = new Map<string, CorpusPoll>();

const corporaRefresh = useRequestResource<void, NormalizedIndexBase[]>({
	mode: 'manual',
	request: () => blacklab.getCorpora(),
});
const formatsRefresh = useRequestResource<void, NormalizedFormat[]>({
	mode: 'manual',
	request: () => blacklab.getFormats(),
});
const loadingCorpora = computed(() => loadingServerInfo.value || loadingCorpusMutation.value || corporaRefresh.state.value.loading);
const loadingFormats = computed(() => loadingServerInfo.value || loadingFormatMutation.value || formatsRefresh.state.value.loading);

const publicCorpora = computed(() => corpora.value.filter(c => !c.owner));
const publicFormats = computed(() => formats.value.filter(f => !f.owner)),
	privateFormats = computed(() => formats.value.filter(f => f.owner));
const corpus = computed(() => (indexId.value ? corpora.value.find(c => c.id === indexId.value) || null : null));
const format = computed(() => (formatId.value ? formats.value.find(f => f.id === formatId.value) || null : null));

function success(message: string) {
	successMessage.value = message;
	errorMessage.value = '';
}

function error(message: string) {
	errorMessage.value = message;
	successMessage.value = '';
}

function stopCorpusPoll(indexId: string) {
	const poll = corpusPolls.get(indexId);
	if (!poll) return;
	corpusPolls.delete(indexId);
	poll.request?.cancel();
	if (poll.timer) clearTimeout(poll.timer);
}

function runCorpusPoll(indexId: string, poll: CorpusPoll) {
	if (corpusPolls.get(indexId) !== poll) return;
	if (!corpora.value.some(c => c.id === indexId)) return void corpusPolls.delete(indexId);

	const request = blacklab.getCorpusStatus(indexId);
	poll.request = request;
	request.then(
		newCorpusState => {
			if (corpusPolls.get(indexId) !== poll) return;
			poll.request = null;
			const currentCorpus = corpora.value.find(c => c.id === indexId);
			if (!currentCorpus) return void corpusPolls.delete(indexId);
			Object.assign(currentCorpus, newCorpusState);
			if (newCorpusState.status !== 'indexing') return void corpusPolls.delete(indexId);
			poll.timer = setTimeout(() => {
				if (corpusPolls.get(indexId) === poll) {
					poll.timer = null;
					runCorpusPoll(indexId, poll);
				}
			}, 2000);
		},
		cause => {
			if (corpusPolls.get(indexId) !== poll) return;
			corpusPolls.delete(indexId);
			const requestError = ApiError.wrap(cause);
			if (!requestError.isCancelledRequest) error(`Could not retrieve status for corpus "${poll.displayName}": ${requestError.message}`);
		},
	);
}

/** Begin periodically refreshing the corpus for as long as the status is indexing. */
function refreshCorpus(indexId: string) {
	if (corpusPolls.has(indexId)) return;
	const currentCorpus = corpora.value.find(c => c.id === indexId);
	if (!currentCorpus) return;
	const poll: CorpusPoll = { displayName: currentCorpus.displayName, request: null, timer: null };
	corpusPolls.set(indexId, poll);
	runCorpusPoll(indexId, poll);
}

function refreshCorpora() {
	corporaRefresh.run();
}

function refreshFormats() {
	formatsRefresh.run();
}

function close() {
	modal.value = '';
	indexId.value = formatId.value = null;
	confirmAction.value = undefined;
}

const doCreateCorpus = () => (modal.value = 'create-corpus');
const doCreateFormat = () => (modal.value = 'create-format');

function doUploadCorpus(id: string) {
	indexId.value = id;
	modal.value = 'upload';
}

function doShareCorpus(id: string) {
	indexId.value = id;
	modal.value = 'share-corpus';
}

function doEditFormat(id: string) {
	formatId.value = id;
	modal.value = 'create-format';
}

function doDeleteCorpus(id: string) {
	indexId.value = id;
	const selectedCorpus = corpus.value!;
	confirmTitle.value = `Delete corpus <em>${selectedCorpus.displayName}</em>?`;
	confirmMessage.value = `Are you sure you want to delete corpus "${selectedCorpus.displayName}"?`;
	modal.value = 'confirm';
	confirmAction.value = () => {
		close();
		loadingCorpusMutation.value = true;
		blacklab
			.deleteCorpus(id)
			.then(response => {
				successMessage.value = response.status.message;
				stopCorpusPoll(id);
				corpora.value = corpora.value.filter(c => c.id !== id);
			})
			.catch((e: ApiError) => error(`Could not delete corpus "${selectedCorpus.displayName}": ${e.message}`))
			.finally(() => (loadingCorpusMutation.value = false));
	};
}

function doDeleteFormat(id: string) {
	formatId.value = id;
	const selectedFormat = format.value!;
	confirmTitle.value = `Delete import format <em>${selectedFormat.displayName}</em>?`;
	confirmMessage.value = `You are about to delete the import format <i>${selectedFormat.id}</i>.<br>Are you sure?`;
	modal.value = 'confirm';
	confirmAction.value = () => {
		close();
		loadingFormatMutation.value = true;
		blacklab
			.deleteFormat(selectedFormat.id)
			.then(response => {
				successMessage.value = response.status.message;
				formats.value = formats.value.filter(f => f.id !== selectedFormat.id);
			})
			.catch((e: ApiError) => error(`Could not delete format "${selectedFormat.displayName}": ${e.message}`))
			.finally(() => (loadingFormatMutation.value = false));
	};
}

watch(
	corpora,
	value => {
		const currentIds = new Set(value.map(c => c.id));
		for (const id of corpusPolls.keys()) if (!currentIds.has(id)) stopCorpusPoll(id);
		for (const currentCorpus of value) if (currentCorpus.status === 'indexing') refreshCorpus(currentCorpus.id);
	},
	{ immediate: true },
);

watch(corporaRefresh.state, state => {
	if (!state.loading && state.settled.isLoaded()) corpora.value = state.settled.value.sort((a, b) => a.displayName.localeCompare(b.displayName));
	else if (!state.loading && state.settled.isError()) errorMessage.value = state.settled.error.message;
});

watch(formatsRefresh.state, state => {
	if (!state.loading && state.settled.isLoaded()) formats.value = state.settled.value.sort((a, b) => a.displayName.localeCompare(b.displayName));
	else if (!state.loading && state.settled.isError()) errorMessage.value = state.settled.error.message;
});

onUnmounted(() => [...corpusPolls.keys()].forEach(stopCorpusPoll));

async function bootstrap() {
	try {
		loadingServerInfo.value = true;
		try {
			serverInfo.value = await blacklab.getServerInfo();
		} catch (cause) {
			errorMessage.value = `Error loading BlackLab info: ${(cause as { message?: string }).message}`;
			loadingServerInfo.value = false;
			return;
		}

		loadingServerInfo.value = false;
		corpora.value = Object.values(serverInfo.value.corpora).sort((a, b) => a.displayName.localeCompare(b.displayName));
		refreshFormats();
	} catch (cause) {
		errorMessage.value = cause instanceof ApiError ? cause.message : 'An unknown error occurred: ' + JSON.stringify(cause);
		loadingServerInfo.value = false;
	}
}

bootstrap();
</script>

<style lang="scss" scoped>
/* page layout, hiding/showing portions */

.alert {
	margin-top: 1em;
	margin-left: -15px;
	margin-right: -15px;
}
</style>
