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
		isLoading(): boolean { return this.request != null; }
	},
	methods: {
		load(): void {
			if (this.fieldDisplayName || this.error || this.request) {
				return;
			}

			// Find the display name and content length for the current annotated field.
			const annotatedFieldName = RootStore.getState().field;
			if (annotatedFieldName) {
				// Content length can be found in the document info
				this.lengthTokens = this.document?.docInfo.tokenCounts?.find(t => t.fieldName === annotatedFieldName)?.tokenCount ?? -1;

				// The display name either comes from i18n, or from BlackLab.
				this.fieldDisplayName = this.$tAnnotatedFieldDisplayName({id: annotatedFieldName} as any);
				if (this.fieldDisplayName?.length === 0) {
					// Not in i18n; use the value from BlackLab.
					this.request = blacklab.getAnnotatedField(RootStore.getState().indexId, annotatedFieldName)
					.then(fieldInfo => {
						this.fieldDisplayName = fieldInfo.displayName;
					})
					.catch(error => this.error = error)
					.finally(() => this.request = null);
				}
			} else {
				this.fieldDisplayName = 'Contents';
				console.log('default', this.fieldDisplayName);
			}
		}
	},
	watch: {
		fieldDisplayName() {
			document.getElementById('parallel-version')!.innerText = ` (${this.fieldDisplayName})`;
			document.getElementById('docLengthTokens')!.innerText = `${this.lengthTokens}`;
		}
	},
	created() {
		const metaTab = (document.querySelector('a[href="#metadata"]') as HTMLAnchorElement);
		metaTab.addEventListener('click', () => this.load(), { once: true });
	}
});

</script>
