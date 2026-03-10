<template>
	<SelectPicker
		class="sort"
		data-class="btn-sm btn-default"
		:placeholder="$t('results.sort.sortBy')"
		data-menu-width="grow"

		allowHtml
		hideDisabled
		allowUnknownValues
		right

		:options="sortOptions"
		:disabled="disabled"

		v-model="model"
	/>
</template>

<script lang="ts">
import Vue from 'vue';
import { NormalizedIndex } from '@/types/apptypes';
import SelectPicker, { OptGroup } from '@/components/SelectPicker.vue';
import { getAnnotationSubset, getMetadataSubset } from '@/utils';
import debug from '@/utils/debug';
import { corpusCustomizations } from '@/utils/customization';

export default Vue.extend({
	components: {
		SelectPicker
	},
	props: {
		hits: Boolean,
		docs: Boolean,
		groups: Boolean,
		parallelCorpus: Boolean,

		value: String,

		corpus: Object as () => NormalizedIndex,
		annotations: Array as () => string[],
		annotationGroupLabels: Boolean,
		metadata: Array as () => string[],
		metadataGroupLabels: Boolean,
		disabled: Boolean,
	},
	computed: {
		model: {
			get(): string { return this.value; },
			set(v: string) { this.$emit('input', v); }
		},
		sortOptions(): OptGroup[] {
			const options = [] as OptGroup[];

			/** Customize and add one or more groups */
			const addGroups = ((...optGroups: OptGroup[]) => {
				options.push(...optGroups.map(optGroup => {
					return corpusCustomizations.sort.customize(optGroup) ?? optGroup;
				}));
			});

			if (this.groups) {
				addGroups({
					label: 'Groups',
					options: [{
						label: this.$t('results.table.sortBy', {field: this.$t('results.table.sort_groupName')}).toString(),
						value: 'identity',
					}, {
						label: this.$t('results.table.sortByDescending', {field: this.$t('results.table.sort_groupName')}).toString(),
						value: '-identity',
					}, {
						label: this.$t('results.table.sortBy', {field: this.$t('results.table.sort_groupSize')}).toString(),
						value: 'size',
					}, {
						label: this.$t('results.table.sortByDescending', {field: this.$t('results.table.sort_groupSize')}).toString(),
						value: '-size', // numeric sorting is inverted: https://github.com/instituutnederlandsetaal/blacklab-frontend/issues/340
					}]
				});
			}

			if (this.hits) {
				addGroups(...getAnnotationSubset(
					this.annotations,
					this.corpus.annotationGroups,
					this.corpus.annotatedFields[this.corpus.mainAnnotatedField].annotations,
					'Sort',
					this,
					this.corpus.textDirection,
					debug.debug,
					this.annotationGroupLabels
				));

				if (this.parallelCorpus) {
					addGroups({
						label: 'Parallel Corpus',
						options: [{
							label: this.$t('results.table.sortBy', {field: this.$t('results.table.sort_alignments')}).toString(),
							value: 'alignments'
						}, {
							label: this.$t('results.table.sortByDescending', {field: this.$t('results.table.sort_alignments')}).toString(),
							value: '-alignments'
						},]
					});
				}
			}
			if (this.docs) {
				addGroups({
					label: 'Documents',
					options: [{
						label: this.$t('results.table.sortBy', {field: this.$t('results.table.sort_numberOfHits')}).toString(),
						value: 'numhits'
					}, {
						label: this.$t('results.table.sortByDescending', {field: this.$t('results.table.sort_numberOfHits')}).toString(),
						value: '-numhits' // numeric sorting is inverted: https://github.com/instituutnederlandsetaal/blacklab-frontend/issues/340
					}]
				});
			}

			if (!this.groups) {
				addGroups(...getMetadataSubset(
					this.metadata,
					this.corpus.metadataFieldGroups,
					this.corpus.metadataFields,
					'Sort',
					this,
					debug.debug,
					this.metadataGroupLabels,
					corpusCustomizations.search.metadata.showField,
				));
			}

			return options;
		},
	}
})
</script>