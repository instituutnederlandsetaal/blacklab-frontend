<template>
<div class="container">

	<Spinner v-if="loadingServerInfo" lg center/>

	<div v-if="!busy && !serverInfo && errorMessage" class="alert alert-danger">
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
		<div v-if="!publicCorpora.length && !loadingCorpora && !canCreateCorpus" class="cf-panel cf-panel-lg" >
			<h2>No corpora available</h2>
			<p>No corpora have been added to BlackLab. Corpora will appear here when when they become available.</p>
		</div>
		<CorpusTable v-if="publicCorpora.length"
			:loading="loadingCorpora"
			:corpora="publicCorpora"
			:formats="formats"
			title="Public corpora"
		/>

		<!-- always shown if logged in -->
		<CorpusTable v-if="loggedIn"
			title="Your corpora"
			isPrivate

			:loading="loadingCorpora"
			:corpora="privateCorpora"
			:formats="formats"
			:canCreateCorpus="canCreateCorpus"

			@share="doShareCorpus"
			@upload="doUploadCorpus"
			@delete="doDeleteCorpus"
			@create="doCreateCorpus"
		/>

		<FormatsTable v-if="loggedIn"
			:formats="privateFormats"
			:loading="loadingFormats"
			@create="doCreateFormat"
			@edit="doEditFormat"
			@delete="doDeleteFormat"
		/>

		<!-- Modals -->
		<ModalCreateFormat v-if="modal === 'create-format'"
			:publicFormats="publicFormats"
			:privateFormats="privateFormats"
			:loading="loadingFormats"
			:format="format"

			@create="refreshFormats"
			@success="success"
			@error="error"
			@close="close"
		/>
		<ModalCreateCorpus v-if="modal === 'create-corpus'"
			:publicFormats="publicFormats"
			:privateFormats="privateFormats"
			:loading="loadingFormats"
			:user="serverInfo.user"

			@create="refreshCorpora"
			@success="success"
			@error="error"
			@close="close"
		/>
		<ModalUpload v-if="modal === 'upload'"
			:corpus="corpus"
			:formats="formats"
			@indexing="refreshCorpus"
			@success="success"
			@error="error"
			@close="close"
		/>
		<ModalShareCorpus v-if="modal === 'share-corpus'"
			:corpus="corpus"
			@success="success"
			@error="error"
			@close="close"
		/>
		<Modal v-if="modal === 'confirm'"
			closeMessage="Cancel"
			confirmMessage="Delete"
			confirmClass="btn-danger"
			@confirm="confirmAction"
			@close="close"
		>
			<template #title><h4 v-html="confirmTitle" class="modal-title"></h4></template>
			<p v-html="confirmMessage"></p>
		</Modal>
	</template>
</div>

</template>
<script lang="ts">
import Vue from 'vue';
import { NormalizedFormat, NormalizedIndexBase } from '@/types/apptypes';
import { BLServer } from '@/types/blacklabtypes';
import * as Api from '@/api';
import { normalizeIndexBase } from '@/utils/blacklabutils';

import Spinner from '@/components/Spinner.vue';
import CorpusTable from './CorpusTable.vue';
import FormatsTable from './FormatsTable.vue';
import Modal from '@/components/Modal.vue';
import ModalCreateCorpus from '@/pages/corpora/ModalCreateCorpus.vue';
import ModalCreateFormat from '@/pages/corpora/ModalCreateFormat.vue';
import ModalUpload from '@/pages/corpora/ModalUpload.vue';
import ModalShareCorpus from '@/pages/corpora/ModalShare.vue';

export default Vue.extend({
	components: {Spinner, CorpusTable, FormatsTable, ModalCreateCorpus, ModalCreateFormat, ModalUpload, ModalShareCorpus, Modal},
	data: () => ({
		corpora: [] as NormalizedIndexBase[],
		formats: [] as NormalizedFormat[],
		serverInfo: undefined as any as BLServer,
		errorMessage: '',
		successMessage: '',
		confirmMessage: '',
		confirmTitle: '',
		confirmAction: undefined as (() => void)|undefined,

		loadingFormats: false,
		loadingCorpora: false,
		loadingServerInfo: false,

		modal: '',

		corpusId: null as null|string,
		formatId: null as null|string,

		refreshingCorpora: new Set() as Set<string>
	}),

	computed: {
		loggedIn(): boolean { return this.serverInfo?.user?.loggedIn; },
		publicCorpora(): NormalizedIndexBase[] { return this.corpora.filter(c => !c.owner); },
		privateCorpora(): NormalizedIndexBase[] { return this.corpora.filter(c => c.owner); },
		publicFormats(): NormalizedFormat[] { return this.formats.filter(f => !f.owner); },
		privateFormats(): NormalizedFormat[] { return this.formats.filter(f => f.owner); },
		canCreateCorpus(): boolean { return this.serverInfo?.user.canCreateIndex; },

		busy(): boolean { return this.loadingFormats || this.loadingCorpora || this.loadingServerInfo; },

		corpus(): null|NormalizedIndexBase { return this.corpusId ? this.corpora.find(c => c.id === this.corpusId) || null : null; },
		format(): null|NormalizedFormat { return this.formatId ? this.formats.find(f => f.id === this.formatId) || null : null; },
	},
	methods: {
		success(message: string) {
			this.successMessage = message;
			this.errorMessage = '';
		},
		error(message: string) {
			this.errorMessage = message;
			this.successMessage = '';
		},
		refreshCorpora() {
			this.loadingCorpora = true;
			Api.blacklab.getCorpora().then(corpora => this.corpora = corpora.sort((a, b) => a.displayName.localeCompare(b.displayName)))
			.catch((e: Api.ApiError) => this.errorMessage = e.message)
			.finally(() => this.loadingCorpora = false)
		},
		refreshFormats() {
			this.loadingFormats = true;
			Api.blacklab.getFormats().then(formats => this.formats = formats.sort((a, b) => a.displayName.localeCompare(b.displayName)))
			.catch((e: Api.ApiError) => this.errorMessage = e.message)
			.finally(() => this.loadingFormats = false)
		},
		/** Begin periodically refreshing the corpus for as long as the status is indexing. */
		async refreshCorpus(corpusId: string) {
			if (this.refreshingCorpora.has(corpusId)) return;
			this.refreshingCorpora.add(corpusId);

			const displayName = this.corpora.find(c => c.id === corpusId)?.displayName || corpusId;
			try {
				while (true) {
					const newCorpusState = await Api.blacklab.getCorpusStatus(corpusId);
					let corpus = this.corpora.find(c => c.id === corpusId);
					if (!corpus) break; // corpus was deleted?
					Object.assign(corpus, newCorpusState);
					if (newCorpusState.status !== 'indexing') break;
					await new Promise(resolve => setTimeout(resolve, 2000));
				}
				this.refreshingCorpora.delete(corpusId);
			} catch (error) {
				this.errorMessage = `Could not retrieve status for corpus "${displayName}": ${error.message}`;
			}
		},
		close() { this.modal = ''; this.corpusId = this.formatId = null; },
		doCreateCorpus() { this.modal = 'create-corpus'; },
		doCreateFormat() { this.modal = 'create-format'; },
		doUploadCorpus(corpusId: string) { this.corpusId = corpusId; this.modal = 'upload'; },
		doShareCorpus(corpusId: string) { this.corpusId = corpusId; this.modal = 'share-corpus'; },
		doEditFormat(formatId: string) {
			this.formatId = formatId;
			this.modal = 'create-format';
		},
		doDeleteCorpus(corpusId: string) {
			this.corpusId = corpusId;
			const corpus = this.corpus!;
			this.confirmTitle= `Delete corpus <em>${corpus.displayName}</em>?`;
			this.confirmMessage = `Are you sure you want to delete corpus "${corpus.displayName}"?`;
			this.modal = 'confirm';
			this.confirmAction = () => {
				this.close();
				this.loadingCorpora = true;
				Api.blacklab.deleteCorpus(corpusId)
				.then(r => {
					this.successMessage = r.status.message;
					this.corpora = this.corpora.filter(c => c.id !== corpusId);
				})
				.catch((e: Api.ApiError) => this.errorMessage = `Could not delete corpus "${corpus.displayName}": ${e.message}`)
				.finally(() => {
					this.confirmAction = undefined;
					this.loadingCorpora = false;
				});
			}
		},
		doDeleteFormat(formatId: string) {
			this.formatId = formatId;
			const format = this.format!;
			this.confirmTitle = `Delete import format <em>${format.displayName}</em>?`;
			this.confirmMessage = `You are about to delete the import format <i>${format.id}</i>.<br>Are you sure?`,
			this.modal = 'confirm';
			this.confirmAction = () => {
				this.close();
				this.loadingFormats = true;
				Api.blacklab.deleteFormat(format.id)
				.then(r => {
					this.successMessage = r.status.message;
					this.formats = this.formats.filter(f => f.id !== format.id);
				})
				.catch((e: Api.ApiError) => this.errorMessage = `Could not delete format "${format.displayName}": ${e.message}`)
				.finally(() => {
					this.confirmAction = undefined;
					this.loadingFormats = false;
				});
			}
		},
	},
	async created() {
		try {
			this.loadingFormats = this.loadingCorpora = this.loadingServerInfo = true;
			try { this.serverInfo = await Api.blacklab.getServerInfo(); }
			catch (e) {
				this.errorMessage = `Error loading BlackLab info: ${e.message}`;
				this.loadingCorpora = this.loadingFormats = this.loadingServerInfo = false;
				return;
			}

			this.loadingServerInfo = false;
			this.corpora = Object.entries({...this.serverInfo.corpora, ...this.serverInfo.indices})
				.map(([id, index]) => normalizeIndexBase(index, id))
				.sort((a, b) => a.displayName.localeCompare(b.displayName));
			this.loadingCorpora = false;
			this.refreshFormats();
		} catch (error) {
			if (error instanceof Api.ApiError)
				this.errorMessage = error.message;
			else
				this.errorMessage = 'An unknown error occurred: ' + JSON.stringify(error);
			this.loadingCorpora = this.loadingFormats = this.loadingServerInfo = false;
		}
	},
	watch: {
		corpora: {
			deep: false,
			immediate: true,
			handler() {
				this.corpora.forEach(c => {
					if (c.status === 'indexing') this.refreshCorpus(c.id);
				})
			}
		}
	}
})

</script>

<style scoped>
.alert {
	margin-left: -15px;
	margin-right: -15px;
}
</style>