<template>
	<div class="querysummary" ref="root">
		{{ $t('results.querySummary.heading') }}<span class="small text-muted content" :title="summary">{{summary.substr(0, 1000)}}</span>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import * as QueryStore from '@/store/query';

export default Vue.extend({
	computed: {
		pattern: QueryStore.get.patternSummary,
		filters: QueryStore.get.filterSummary,
		summary(): string {
			if (!this.pattern && !this.filters) {
				return this.$t('results.querySummary.allDocuments') as string ;
			}

			let ret = '';
			if (this.pattern) {
				ret += this.pattern + ' ' + this.$t('results.querySummary.within') + ' ';
			}
			if (this.filters) {
				ret += this.$t('results.querySummary.documentsWhere') + ' ' + this.filters;
			} else {
				ret += this.$t('results.querySummary.allDocuments');
			}

			return ret;
		}
	},
});
</script>

<style lang="scss">

.querysummary {
	background: white;
	font-size: 18px;
	padding: 8px 20px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;

	> .content {
		flex-grow: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-left: 0.35em;
	}
}
</style>