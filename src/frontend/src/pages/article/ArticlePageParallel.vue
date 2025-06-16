<template>
</template>

<script lang="ts">
import Vue from 'vue';

import * as RootStore from '@/store/article';
import {blacklab} from '@/api';

import * as BLTypes from '@/types/blacklabtypes';
import * as AppTypes from '@/types/apptypes';
import {i18n}  from '@/utils/i18n';

export default Vue.extend({
	i18n,
	data: () => ({
		request: null as null|Promise<BLTypes.BLAnnotatedField>,
		fieldDisplayName: '',
		lengthTokens: 0,
		error: null as null|AppTypes.ApiError,
	}),
	computed: {
		document: RootStore.get.document,
		field(): string|null { return RootStore.getState().field; },
	},
	watch: {
		field: {
			immediate: true,
			handler() {
				if (!this.field) return;
				// Find the display name and content length for the current annotated field.
				// Content length can be found in the document info
				this.lengthTokens = this.document?.docInfo.tokenCounts?.find(t => t.fieldName === this.field)?.tokenCount ?? -1;
				this.fieldDisplayName = this.$tAnnotatedFieldDisplayName({id: this.field});

				// The display name either comes from i18n, or from BlackLab.
				if (this.fieldDisplayName?.length === 0) {
					// Not in i18n; use the value from BlackLab.
					this.request = blacklab.getAnnotatedField(RootStore.getState().indexId, this.field)
						.then(fieldInfo => this.fieldDisplayName = fieldInfo.displayName)
						.catch(error => this.error = error)
						.finally(() => this.request = null);
				}
			},
		},
		fieldDisplayName() {
			if (this.fieldDisplayName) {
				document.getElementById('parallel-version')!.innerText = ` (${this.fieldDisplayName})`;
				document.getElementById('docLengthTokens')!.innerText = `${this.lengthTokens}`;
				const contentTitle = document.getElementById('content-title')
				if (contentTitle)
					contentTitle.innerHTML = document.getElementById('meta-title')?.innerHTML ?? '??'
			}
		}
	},
});

</script>
