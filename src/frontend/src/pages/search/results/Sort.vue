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
import type { Corpus } from '@/types/apptypes';
import type { BLCollocationScorer } from '@/types/blacklabtypes';

import { getAnnotationSubset, getMetadataSubset } from '@/shared/blacklab-helpers/field-groups';
import debug from '@/shared/debug/debug';
import { useI18n } from '@/shared/i18n';
import type { OptGroup, Option } from '@/shared/utils/options';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

const {
	hits = false,
	docs = false,
	groups = false,
	collocations = false,
	collocationScorer,
	corpus,
	disabled = false,
} = defineProps<{
	hits?: boolean;
	docs?: boolean;
	groups?: boolean;
	collocations?: boolean;
	collocationScorer?: BLCollocationScorer;
	corpus: Corpus;
	disabled?: boolean;
}>();
const model = defineModel<string | null>({ default: null });
const customizations = useCustomizations();
const translate = useI18n();
const associationSortLabel = computed(() => {
	if (!collocationScorer) return translate.$t('collocations.results.associationShort').toString();
	const scorer =
		collocationScorer === 'coll-dice'
			? translate.$t('collocations.scorers.dice').toString()
			: collocationScorer === 'coll-salience'
				? translate.$t('collocations.scorers.salience').toString()
				: collocationScorer;
	return translate.$t('collocations.results.association', { scorer }).toString();
});
function sortPair(field: string, value: string): Option[] {
	return [
		{ label: translate.$t('results.table.sortBy', { field }), value },
		{
			label: translate.$t('results.table.sortByDescending', { field }),
			value: `-${value}`, // BlackLab inverts numeric direction for size/numhits: https://github.com/instituutnederlandsetaal/blacklab-frontend/issues/340
		},
	];
}
const sortOptions = computed<OptGroup[]>(() => {
	const annotations = customizations.resultSortAnnotationIds();
	const annotationGroupLabels = customizations.resultSortAnnotationLabelsVisible();
	const metadata = customizations.resultSortMetadataIds();
	const metadataGroupLabels = customizations.resultSortMetadataLabelsVisible();
	const options: OptGroup[] = [];
	const addGroups = (...groups: OptGroup[]) => options.push(...groups.map(customizations.sortOptionGroup));

	if (groups) {
		addGroups({
			label: translate.$t(collocations ? 'queryForm.collocations' : 'results.sort.groups'),
			options: collocations
				? [
						...sortPair(associationSortLabel.value, 'score'),
						...sortPair(translate.$t('collocations.results.collocate'), 'identity'),
						...sortPair(translate.$t('collocations.results.cooccurrences'), 'size'),
					]
				: [...sortPair(translate.$t('results.table.sort_groupName'), 'identity'), ...sortPair(translate.$t('results.table.sort_groupSize'), 'size')],
		});
	}

	if (hits) {
		addGroups(...getAnnotationSubset(annotations, corpus.annotationGroups, corpus.annotatedFields[corpus.mainAnnotatedField].annotations, 'Sort', translate, debug.value, annotationGroupLabels));

		if (corpus.isParallelCorpus) {
			addGroups({
				label: translate.$t('results.sort.parallelCorpus'),
				options: sortPair(translate.$t('results.table.sort_alignments'), 'alignments'),
			});
		}
	}
	if (docs) {
		addGroups({
			label: translate.$t('results.sort.documents'),
			options: sortPair(translate.$t('results.table.sort_numberOfHits'), 'numhits'),
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
