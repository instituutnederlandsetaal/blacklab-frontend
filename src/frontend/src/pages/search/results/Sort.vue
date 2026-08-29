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

<script setup lang="ts">
import { computed } from 'vue';

import { useCustomizations } from '@/customization-api/internal/internal-api';
import type { NormalizedIndex } from '@/types/apptypes';

import { getAnnotationSubset, getMetadataSubset } from '@/shared/blacklab-helpers/field-groups';
import debug from '@/shared/debug/debug';
import { useI18n } from '@/shared/i18n';
import type { OptGroup } from '@/shared/utils/options';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

const {
	hits = false,
	docs = false,
	groups = false,
	parallelCorpus = false,
	corpus,
	annotations,
	annotationGroupLabels = false,
	metadata,
	metadataGroupLabels = false,
	disabled = false,
} = defineProps<{
	hits?: boolean;
	docs?: boolean;
	groups?: boolean;
	parallelCorpus?: boolean;
	corpus: NormalizedIndex;
	annotations: string[];
	annotationGroupLabels?: boolean;
	metadata: string[];
	metadataGroupLabels?: boolean;
	disabled?: boolean;
}>();
const model = defineModel<string | null>({ default: null });
const customizations = useCustomizations();
const translate = useI18n();
const sortOptions = computed<OptGroup[]>(() => {
	const options: OptGroup[] = [];
	const addGroups = (...groups: OptGroup[]) => options.push(...groups.map(customizations.sortOptionGroup));

	if (groups) {
		addGroups({
			label: 'Groups',
			options: [
				{
					label: translate.$t('results.table.sortBy', { field: translate.$t('results.table.sort_groupName') }),
					value: 'identity',
				},
				{
					label: translate.$t('results.table.sortByDescending', { field: translate.$t('results.table.sort_groupName') }),
					value: '-identity',
				},
				{
					label: translate.$t('results.table.sortBy', { field: translate.$t('results.table.sort_groupSize') }),
					value: 'size',
				},
				{
					label: translate.$t('results.table.sortByDescending', { field: translate.$t('results.table.sort_groupSize') }),
					value: '-size', // numeric sorting is inverted: https://github.com/instituutnederlandsetaal/blacklab-frontend/issues/340
				},
			],
		});
	}

	if (hits) {
		addGroups(...getAnnotationSubset(annotations, corpus.annotationGroups, corpus.annotatedFields[corpus.mainAnnotatedField].annotations, 'Sort', translate, debug.value, annotationGroupLabels));

		if (parallelCorpus) {
			addGroups({
				label: 'Parallel Corpus',
				options: [
					{
						label: translate.$t('results.table.sortBy', { field: translate.$t('results.table.sort_alignments') }),
						value: 'alignments',
					},
					{
						label: translate.$t('results.table.sortByDescending', { field: translate.$t('results.table.sort_alignments') }),
						value: '-alignments',
					},
				],
			});
		}
	}
	if (docs) {
		addGroups({
			label: 'Documents',
			options: [
				{
					label: translate.$t('results.table.sortBy', { field: translate.$t('results.table.sort_numberOfHits') }),
					value: 'numhits',
				},
				{
					label: translate.$t('results.table.sortByDescending', { field: translate.$t('results.table.sort_numberOfHits') }),
					value: '-numhits', // numeric sorting is inverted: https://github.com/instituutnederlandsetaal/blacklab-frontend/issues/340
				},
			],
		});
	}

	if (!groups) {
		addGroups(
			...getMetadataSubset(metadata, corpus.metadataFieldGroups, corpus.metadataFields, 'Sort', translate, debug.value, metadataGroupLabels, id =>
				customizations.resultMetadataField(corpus.metadataFields[id]),
			),
		);
	}

	return options;
});
</script>
