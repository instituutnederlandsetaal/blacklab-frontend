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
import type { OptGroup } from '@/components/SelectPicker.vue';
import SelectPicker from '@/components/SelectPicker.vue';
import type { NormalizedIndex } from '@/types/apptypes';
import { getAnnotationSubset, getMetadataSubset } from '@/utils';
import { corpusCustomizations } from '@/utils/customization';
import debug from '@/utils/debug';
import type { PropType } from 'vue';
import { defineComponent } from 'vue';

export default defineComponent({
	components: {
		SelectPicker
	},
	props: {
		hits: Boolean,
		docs: Boolean,
		groups: Boolean,
		parallelCorpus: Boolean,

		modelValue: { type: String, required: true },

		corpus: { type: Object as PropType<NormalizedIndex>, required: true },
		annotations: { type: Array as PropType<string[]>, required: true },
		annotationGroupLabels: Boolean,
		metadata: { type: Array as PropType<string[]>, required: true },
		metadataGroupLabels: Boolean,
		disabled: Boolean,
	},
	computed: {
		model: {
			get(): string { return this.modelValue; },
			set(v: string) { this.$emit('update:modelValue', v); }
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