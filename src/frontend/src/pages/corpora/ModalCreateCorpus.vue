<template>
	<Modal title="Create new Corpus" @close="$emit('close')" @confirm="createCorpus" closeMessage="Cancel">
		<div v-if="errorMessage" class="alert alert-danger">
			<a href="#" class="close" aria-label="close" @click="errorMessage = ''">×</a>
			{{ errorMessage }}
		</div>

		<div class="container-fluid">
			<div class="form-group">
				<label style="width: 100%;">Corpus Name <input id="corpus_name" maxlength="80" class="form-control" v-model="corpusName" placeholder="Corpus name"></label>
			</div>
			<div class="form-group">
				<label for="corpus_document_type" title="The format of the documents that will be stored in the corpus">Document Format</label>
				<br>
				<SelectPicker
					id="corpus_document_type"
					hideEmpty
					allowHtml
					placeholder="Select a document format..."
					container="body"
					data-menu-width="auto"
					data-width="100%"
					:loading="loading"
					:options="formatOptions"

					v-model="documentType"
				/>
				<small v-if="selectedFormat" class="text-muted" style="display: block; padding: 8px 8px 0px;">{{selectedFormat.description}}</small>
				<small v-if="selectedFormat && selectedFormat.helpUrl" style="display: block; padding: 8px 8px 0px;"><a target="_blank" :href="selectedFormat.helpUrl">More information</a></small>
			</div>
		</div>

	</Modal>
</template>
<script lang="ts">
import Vue from 'vue';
import Modal from '@/components/Modal.vue';
import SelectPicker from '@/components/SelectPicker.vue';
import { NormalizedFormat } from '@/types/apptypes';
import { Options } from '@/components/SelectPicker.vue';
import { BLUser } from '@/types/blacklabtypes';
import * as Api from '@/api';



export default Vue.extend({
	components: {Modal, SelectPicker},
	props: {
		publicFormats: Array as () => NormalizedFormat[],
		privateFormats: Array as () => NormalizedFormat[],
		loading: Boolean,
		user: Object as () => BLUser
	},
	data: () => ({
		corpusName: '',
		documentType: '',
		errorMessage: '',
	}),
	computed: {
		selectedFormat(): NormalizedFormat|undefined {
			return this.publicFormats?.find(f => f.id === this.documentType) || this.privateFormats?.find(f => f.id === this.documentType);
		},
		formatOptions(): Options {
			const r: Options = [];
			if (this.privateFormats) r.push({label: 'Custom', options: this.privateFormats.map(f => ({value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>`}))});
			if (this.publicFormats) r.push({label: 'Public', options: this.publicFormats.map(f => ({value: f.id, label: `${f.displayName} <small class="text-muted">${f.id}</small>`}))});
			return r;
		}
	},
	methods: {
		createCorpus() {
			if (!this.corpusName) return this.errorMessage = 'Please enter a name for the corpus.';
			if (!this.documentType) return this.errorMessage = 'Please select a document format.';
			if (!this.user?.loggedIn || !this.user?.id) {
				console.error('user not logged in - cannot create corpus (!?)');
				return;
			};

			// Prefix the user name because it's a private index
			const indexName = this.user.id + ':' + this.corpusName.replace(/[\s\\/:]+/g, '_');
			const displayName = this.corpusName;

			Api.blacklab
			.postCorpus(indexName, displayName, this.documentType)
			.then(() => {
				this.$emit('create');
				this.$emit('success', `Corpus "${displayName}" created.`);
			})
			.catch((e: Api.ApiError) => this.$emit('error', `Could not create corpus "${displayName}": ${e.message}`))
			.finally(() => this.$emit('close'));
		}
	}
})

</script>