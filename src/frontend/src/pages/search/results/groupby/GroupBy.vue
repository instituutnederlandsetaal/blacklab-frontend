<template>
	<button v-if="!active && !addedCriteria.length" class="btn btn-default btn-secondary btn-sm groupselect" type="button" @click="active = true">
		{{ $t('results.groupBy.groupResults') }}
	</button>

	<div v-else class="panel panel-primary">
		<div class="panel-heading" style="display: flex; align-items: first baseline; gap: 0.25em">
			<h3 class="panel-title" style="padding-right: 0.5em">{{ $t('results.groupBy.groupResults') }}</h3>
			<button v-if="type === 'hits'" class="btn btn-default" type="button" @click="addAnnotation">+ {{ $t('results.groupBy.annotation') }}</button>
			<button class="btn btn-default" type="button" @click="addMetadata">+ {{ $t('results.groupBy.metadata') }}</button>
			<button
				type="button"
				:disabled="disabled"
				class="close"
				style="margin-left: auto"
				@click="clear"
				:title="addedCriteria.length ? $t('results.groupBy.clear').toString() : $t('results.groupBy.close').toString()"
			>
				&times;
			</button>
		</div>

		<Tabs
			v-if="tabs.length"
			style="margin-top: 6px; padding: 0 0.5em"
			:tabs="tabs"
			wrap
			v-model="selectedCriteriumIndex"
			@middlemouse="$event.index < addedCriteria.length && removeGroup($event.index)"
		>
			<template #after="{ i }">
				<button type="button" @click="removeGroup(i)" class="btn btn-link remove-group-button" style="font-size: 150%; text-decoration: none">
					<strong class="text-danger">&times;</strong>
				</button>
			</template>
		</Tabs>

		<div class="panel-body" v-if="!addedCriteria.length || selectedCriterium">
			<template v-if="selectedCriterium?.type === 'context'">
				<span v-if="isParallel">{{ $t('results.groupBy.parallelCorpusVersion') }}</span>
				<SelectPicker v-if="isParallel" :options="parallelVersionOptions" v-model="fieldName" allowUnknownValues data-width="auto" data-menu-width="auto" hideEmpty />
				<i18n-t keypath="results.groupBy.iWantToGroupOnAnnotation" tag="div" scope="global">
					<!-- allow unknown values here. If grouping on a capture group/relation, they're not always available immediately (we need the first hit to decode them). -->
					<template #some_words><SelectPicker :options="contextOptions" v-model="contextValue" allowUnknownValues data-width="auto" data-menu-width="auto" hideEmpty allowHtml /></template>
					<!-- Specific layout, we want to hide the selectpicker, but there might be surrounding text that also needs to be hidden... -->
					<template #in_this_location_with_text>
						<!-- if not grouping on a label but on a specific position, then show the position picker. -->
						<i18n-t v-if="selectedCriteriumAsPositional" keypath="results.groupBy.in_this_location_with_text" scope="global">
							<template #in_this_location>
								<SelectPicker v-model="positionValue" hideEmpty data-width="auto" data-menu-width="auto" :options="positionOptions" />
							</template>
						</i18n-t>
					</template>
					<template #this_annotation>
						<SelectPicker
							:placeholder="'...' + '\xa0'.repeat(20) /*nbsp*/"
							data-width="auto"
							data-menu-width="auto"
							right
							searchable
							hideEmpty
							:options="annotationDropdownOptions"
							allowHtml
							v-model="selectedCriterium.annotation"
					/></template>
				</i18n-t>

				<form class="case-and-context">
					<div class="labels">
						<label for="group-case-sensitive">{{ $t('results.groupBy.caseSensitive') }}: </label>
						<label v-if="showRelationPartWidget" for="group-relation">{{ relationPartByClass('label') }}:</label>
					</div>
					<div class="inputs">
						<input id="group-case-sensitive" type="checkbox" v-model="selectedCriterium.caseSensitive" />
						<div v-if="showRelationPartWidget" class="btn-group">
							<button
								type="button"
								v-if="relationSourceInThisField(relationMatchInfoDefByLabel(selectedCriteriumAsLabel ? selectedCriteriumAsLabel.context.label : ''))"
								class="btn btn-default btn-sm"
								:class="{ active: selectedCriterium.context.type === 'label' && selectedCriterium.context.relation === 'source' }"
								@click="selectedCriteriumAsLabel && (selectedCriteriumAsLabel.context.relation = 'source')"
							>
								{{ relationPartByClass('source') }}
							</button>
							<button
								type="button"
								v-if="relationTargetInThisField(relationMatchInfoDefByLabel(selectedCriteriumAsLabel ? selectedCriteriumAsLabel.context.label : ''))"
								class="btn btn-default btn-sm"
								:class="{ active: selectedCriterium.context.type === 'label' && selectedCriterium.context.relation === 'target' }"
								@click="selectedCriteriumAsLabel && (selectedCriteriumAsLabel.context.relation = 'target')"
							>
								{{ relationPartByClass('target') }}
							</button>
							<!-- Never want to group on things in between source and target of a relation apparently. So don't show this button. -->
							<!-- <button type="button"
								class="btn btn-default btn-sm"
								:class="{active: current.context.relation === 'full' || !current.context.relation}"
								@click="current.context.relation = 'full'"
							>both</button> -->
						</div>
					</div>
				</form>

				<div style="padding: 10px 0 25px" v-if="sliderVisible">
					<div v-html="$t('results.groupBy.chooseWordPositions')"></div>
					<Slider :direction="sliderInverted ? 'rtl' : 'ltr'" inline :min="1" :max="contextsize" :data="sliderLabels" v-model="sliderValue" />
				</div>

				<em class="text-muted" v-if="relations.length + captures.length"><span class="fa fa-exclamation-triangle text-primary"></span> {{ $t('results.groupBy.tipClickOnHighlightedWords') }} ⤵</em>
			</template>
			<template v-else-if="selectedCriterium?.type === 'metadata'" class="content">
				{{ $t('results.groupBy.selectDocumentMetadata') }}<br />
				<SelectPicker
					:placeholder="$t('results.groupBy.metadata')"
					allowHtml
					hideEmpty
					data-width="auto"
					data-menu-width="auto"
					searchable
					v-model="selectedMetadataCriterium"
					:options="metadataDropdownOptions"
				/>

				<!-- mimic style of annotation box. -->
				<form class="case-and-context" v-if="showCaseSensitive">
					<div class="labels">
						<label for="group-case-sensitive">{{ $t('results.groupBy.caseSensitive') }}: </label>
					</div>
					<div class="inputs">
						<input id="group-case-sensitive" type="checkbox" v-model="selectedCriterium.caseSensitive" />
					</div>
				</form>
			</template>
			<template v-else-if="selectedCriterium?.type === 'custom'">
				{{ selectedCriterium.value }}
			</template>
			<em v-else class="h5 text-muted">{{ $t('results.groupBy.clickButtonsToStart') }}</em>
		</div>

		<div v-if="selectedCriterium?.type === 'context'" class="hit-preview panel-footer">
			<template v-for="(section, i) of preview">
				<div v-if="i !== 0" class="separator"></div>
				<template v-for="({ selectedAnnotation, word, punct, active, style, wordAsHtml, selectedAnnotationAsHtml }, j) of section" :key="word + i + '_' + j">
					<component
						:is="active ? 'section' : 'div'"
						:class="{
							word: true,
							active: active,
							'text-primary': active,
							bold: i === 1,
						}"
						:style="style"
						@click="handlePreviewClick($event, i, j)"
					>
						<div v-if="!wordAsHtml" :title="word" class="main">{{ word }}</div>
						<div v-else class="main" v-html="word"></div>

						<div v-if="selectedAnnotationAsHtml" :title="selectedAnnotation" class="annotation" v-html="selectedAnnotation"></div>
						<div v-else :title="selectedAnnotation" class="annotation">{{ selectedAnnotation }}</div>
					</component>
					<!-- punctuation between words. -->
					<component :is="active && section[j + 1]?.active ? 'section' : 'div'" :class="{ punct: true, active: active && section[j + 1]?.active }" :title="punct">{{ punct || ' ' }}</component>
				</template>
			</template>
		</div>

		<div class="panel-footer text-right">
			<button type="button" :disabled="disabled" class="btn btn-default" @click="clear">{{ addedCriteria.length ? $t('results.groupBy.clear') : $t('results.groupBy.close') }}</button>
			<button type="button" :disabled="disabled || !addedCriteria.length" class="btn btn-primary" @click="apply">{{ $t('results.groupBy.apply') }}</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Slider from 'vue-3-slider-component';

import * as SearchModule from '@/app/state/root-store';
import { useCorpus } from '@/app/state/useCorpusContext';
import { getValueFunctions } from '@/components/filters/filterValueFunctions';
import { useCustomizations } from '@/customization-api/internal/internal-api';
import * as FilterModule from '@/features/search/model/form/filter-state';
import * as QueryStore from '@/features/search/model/query-state';
import * as GlobalSearchSettingsStore from '@/features/search/model/results/global-results-state';
import * as ResultsStore from '@/features/search/model/results/view-state';
import { getHighlightColors, mergeMatchInfos } from '@/pages/search/results/table/hit-highlighting';
import { snippetParts } from '@/pages/search/results/table/table-layout';
import type { CaptureAndRelation, HitToken, TokenHighlight } from '@/types/apptypes';
import type { BLHitGroupResults, BLHitResults, BLMatchInfoRelation, BLSearchParameters, BLSearchResult, BLSummaryMatchInfo } from '@/types/blacklabtypes';
import { hasPatternInfo, isHitParams, isHitResults } from '@/types/blacklabtypes';
import type { ContextLabel, ContextPositional, GroupBy, GroupByContext } from '@/utils/grouping';
import { humanizeGroupByOrSortBy, isValidGroupBy, parseGroupBy, serializeSortByOrGroupBy } from '@/utils/grouping';

import { useBlackLabApi } from '@/shared/api';
import { getMetadataSubset, getAnnotationSubset } from '@/shared/blacklab-helpers/field-groups';
import { spanFilterId } from '@/shared/blacklab-helpers/span-filters-helper';
import debug from '@/shared/debug/debug';
import { useI18n } from '@/shared/i18n';
import { useRequestResource } from '@/shared/utils/loadable/loadable-request-resource';
import { findOption, optionText, type OptGroup, type Option, type Options } from '@/shared/utils/options';
import { stableStringify } from '@/shared/utils/stable-stringify';

import SelectPicker from '@/shared/ui/SelectPicker.vue';
import Tabs from '@/shared/ui/Tabs.vue';

// What we prefix the tag attribute grouping option with so we can recognize it
const OPT_PREFIX_SPAN_ATTRIBUTE = '$TAGATTR:';

/** Encode span-attribute grouping as the stable value format shared by options and URL state. */
function spanAttributeOptionValue(name: string, attrName: string, listName?: string): string {
	const groupByName = listName ? `${listName}[${name}]` : name;
	return `${OPT_PREFIX_SPAN_ATTRIBUTE}${JSON.stringify([groupByName, attrName])}`;
}

const {
	type,
	disabled = false,
	results = null,
} = defineProps<{
	type: 'hits' | 'docs';
	disabled?: boolean;
	results?: BLSearchResult | null;
}>();

const customizations = useCustomizations();
const blacklab = useBlackLabApi();
const corpus = useCorpus();
const translate = useI18n();
const addedCriteria = ref<GroupBy[]>([]);
const selectedCriteriumIndex = ref(0);
const storeValueUpdateIsOurs = ref(false);
const active = ref(false);

const storeModule = computed<ResultsStore.ViewModule>(() => ResultsStore.getOrCreateModule(type));
/** This may contain grouping criteria this corpus doesn't support. On page load, it comes directly from the URL. */
const storeValue = computed(() => storeModule.value.getState().groupBy);
const defaultAnnotation = computed(() => {
	const concordanceAnnotation = customizations.resultConcordanceAnnotationId();
	const allowedAnnotations = customizations.resultGroupAnnotationIds();
	return allowedAnnotations.includes(concordanceAnnotation) ? concordanceAnnotation : (allowedAnnotations[0] ?? '');
});

const metadataDropdownOptions = computed<Options>(() =>
	(
		getMetadataSubset(
			customizations.resultGroupMetadataIds(),
			corpus.value.metadataGroups,
			corpus.value.allMetadataFieldsMap,
			'Group',
			translate,
			debug.value,
			customizations.resultGroupMetadataLabelsVisible(),
			id => customizations.resultMetadataField(corpus.value.allMetadataFieldsMap[id]),
		) as OptGroup[]
	)
		.concat(tagAttributes.value)
		.map(group => customizations.groupOptionGroup(group, translate))
		.flatMap<Options[number]>(group => (optionText(group.label) ? group : group.options)),
);
const annotationDropdownOptions = computed<Options>(() =>
	getAnnotationSubset(
		customizations.resultGroupAnnotationIds(),
		corpus.value.annotationGroups,
		corpus.value.allAnnotationsMap,
		'Search',
		translate,
		debug.value,
		customizations.resultGroupAnnotationLabelsVisible(),
	)
		.flatMap(group => customizations.groupOptionGroup(group, translate))
		.flatMap<Options[number]>(group => (optionText(group.label) ? group : group.options)),
);
const tabs = computed<Option[]>(() =>
	addedCriteria.value.map((criterium, index) => ({
		label: humanizeGroupByOrSortBy(translate, criterium, corpus.value.allAnnotationsMap, corpus.value.allMetadataFieldsMap),
		value: index.toString(),
		class: isValidGroupBy(criterium) ? '' : 'text-muted',
	})),
);

const firstHitPreviewQuery = computed<BLSearchParameters | undefined>(() => {
	const current = SearchModule.get.blacklabParameters();
	if (!isHitParams(current)) return undefined;

	const params = { ...current };
	if (!params.viewgroup) delete params.group;
	delete params.subcorpussize;
	delete params.listvalues;
	const sort = (params.sort?.split(',') ?? []).filter(sort => !/^-?(numhits|alignments)$/.test(sort));
	if (corpus.value.isParallelCorpus) sort.unshift('alignments');
	if (sort.length) params.sort = sort.join(',');
	else delete params.sort;
	params.listmetadatavalues = '__nothing__';
	params.first = 0;
	params.number = 1;
	params.waitfortotal = false;
	return params;
});
const firstHitPreviewQueryHash = computed(() => (active.value ? stableStringify(firstHitPreviewQuery.value) : ''));
const firstHitPreviewInput = computed(() => {
	const query = firstHitPreviewQuery.value;
	return active.value && type === 'hits' && query ? { indexId: corpus.value.id!, query } : null;
});
const firstHitPreview = useRequestResource<{ indexId: string; query: BLSearchParameters }, BLHitResults | BLHitGroupResults>({
	mode: 'reactive',
	source: firstHitPreviewInput,
	key: () => firstHitPreviewQueryHash.value,
	async request({ indexId, query }, run) {
		const response = await run.wait(blacklab.getHits(indexId, query));
		run.throwIfAborted();
		if (isHitResults(response)) mergeMatchInfos(response);
		return response;
	},
});
const hits = computed(() => {
	const state = firstHitPreview.state.value;
	return state.phase === 'loaded' && isHitResults(state.data) ? state.data : undefined;
});
const contextsize = computed(() => {
	const params = SearchModule.get.blacklabParameters();
	if (!isHitParams(params)) return 5;
	const globalContext = GlobalSearchSettingsStore.getState().context;
	return typeof params.context === 'number' ? params.context : typeof globalContext === 'number' ? globalContext : 5;
});

const mainSearchField = computed(() => QueryStore.get.sourceField());
const selectedCriterium = computed(() => addedCriteria.value[selectedCriteriumIndex.value]);
const selectedCriteriumAsContext = computed(() => (selectedCriterium.value?.type === 'context' ? (selectedCriterium.value as GroupByContext<ContextLabel | ContextPositional>) : undefined));
const selectedCriteriumAsLabel = computed(() =>
	selectedCriterium.value?.type === 'context' && selectedCriterium.value.context.type === 'label' ? (selectedCriterium.value as GroupByContext<ContextLabel>) : undefined,
);
const selectedCriteriumAsPositional = computed(() =>
	selectedCriterium.value?.type === 'context' && selectedCriterium.value.context.type === 'positional' ? (selectedCriterium.value as GroupByContext<ContextPositional>) : undefined,
);
const selectedCriteriumAsSlider = computed(() => (selectedCriteriumAsPositional.value?.context.whichTokens === 'specific' ? selectedCriteriumAsPositional.value : undefined));

const captures = computed(() => {
	const matchInfos = hits.value?.summary?.pattern?.matchInfos;
	return Object.entries(matchInfos || {})
		.filter(([, matchInfo]) => matchInfo.type === 'span' && (matchInfo.fieldName ?? mainSearchField.value) === (selectedCriteriumAsContext.value?.fieldName ?? mainSearchField.value))
		.map(([name, matchInfo]) => ({ name, label: name, targetField: matchInfo.fieldName }));
});
const relations = computed(() =>
	Object.entries(hits.value?.summary?.pattern?.matchInfos || {}).flatMap(([name, matchInfo]) =>
		matchInfo.type === 'relation' && (relationSourceInThisField(matchInfo) || relationTargetInThisField(matchInfo))
			? [{ name, label: name, targetField: selectedCriteriumAsPositional.value?.fieldName }]
			: [],
	),
);

const tagAttributes = computed<OptGroup[]>(() => {
	let options: Option[] = [];
	const optGroups: OptGroup[] = [];
	const addOption = (tagName: string, attributeName: string, listName?: string) => {
		let shouldInclude = customizations.groupingSpanAttribute({ elementName: tagName, attributeName });
		const filter = FilterModule.getState().filters[spanFilterId(tagName, attributeName)];
		if (shouldInclude === null) {
			const isSpanFilter = filter ? (getValueFunctions(filter)?.isSpanFilter ?? null) : false;
			shouldInclude = isSpanFilter || (customizations.legacyShouldIncludeWithinSpan(tagName) && customizations.legacyShouldIncludeWithinAttribute(tagName, attributeName));
		}
		if (shouldInclude) {
			options.push({
				label: translate.$t('results.table.groupBy', {
					field: filter ? translate.$tMetaDisplayName(filter) : translate.$tWithinAttributeDisplayName(tagName, attributeName),
				}),
				value: spanAttributeOptionValue(tagName, attributeName, listName),
			});
		}
	};

	const matchInfos = hits.value?.summary?.pattern?.matchInfos || {};
	const listEntry = Object.entries(matchInfos).find(([, matchInfo]) => matchInfo.type === 'list');
	if (listEntry) {
		const listName = listEntry[0];
		Object.entries(corpus.value.relations.spans ?? {}).forEach(([tagName, spanInfo]) => {
			if (!spanInfo.attributes) return;
			options = [];
			Object.keys(spanInfo.attributes).forEach(attributeName => addOption(tagName, attributeName, listName));
			if (options.length) optGroups.push({ label: translate.$td(`index.spans.${tagName}`, `Tag ${tagName}`), options });
		});
	} else {
		Object.entries(matchInfos)
			.filter(([, matchInfo]) => matchInfo.type === 'tag')
			.forEach(([tagName, matchInfo]) => {
				if (!relationSourceInThisField(matchInfo)) return;
				options = [];
				Object.keys(corpus.value.relations.spans?.[tagName]?.attributes ?? {}).forEach(attributeName => addOption(tagName, attributeName));
				if (options.length) optGroups.push({ label: translate.$td(`index.spans.${tagName}`, `Tag ${tagName}`), options });
			});
	}
	return optGroups;
});

const relationNames = computed(() => relations.value.map(c => c.name));
const showRelationPartWidget = computed(
	() => selectedCriterium.value?.type === 'context' && selectedCriterium.value.context.type === 'label' && relationNames.value.includes(selectedCriterium.value.context.label),
);
const colors = computed<Record<string, TokenHighlight>>(() => (hits.value ? getHighlightColors(hits.value.summary) : {}));
const showCaseSensitive = computed(() => selectedCriterium.value?.type === 'metadata' && selectedCriterium.value.metadata.type === 'document');
const sliderVisible = computed(() => !!selectedCriteriumAsSlider.value);
const sliderInverted = computed(() => selectedCriteriumAsSlider.value?.context.position === 'E' || selectedCriteriumAsSlider.value?.context.position === 'B');
const sliderLabels = computed(() => Array.from({ length: contextsize.value }, (_, i) => ({ value: i + 1, label: i + 1 })));
const sliderValue = computed<[number, number]>({
	get: (): [number, number] => [selectedCriteriumAsSlider.value?.context.start ?? 1, selectedCriteriumAsSlider.value?.context.end ?? 1],
	set: ([start, end]: [number, number]) => {
		if (!selectedCriteriumAsSlider.value) return;
		selectedCriteriumAsSlider.value.context.start = start;
		selectedCriteriumAsSlider.value.context.end = end;
	},
});

type PreviewToken = {
	active: boolean;
	word: string;
	wordAsHtml: boolean;
	selectedAnnotation: string;
	selectedAnnotationAsHtml: boolean;
	punct: string;
	style: object;
	captureAndRelation: CaptureAndRelation[] | undefined;
};

const preview = computed<PreviewToken[][]>(() => {
	const criterium = selectedCriterium.value;
	if (criterium?.type !== 'context' || !isHitResults(hits.value) || !hits.value.hits.length) return [];

	const wordAnnotation = customizations.resultConcordanceAnnotationId();
	const wordAsHtml = customizations.resultConcordanceAsHtml();
	const firstHit = hits.value.hits.find(v => !!v.otherFields) ?? hits.value.hits[0];
	const targetField = criterium.fieldName;
	const hitInField = targetField && targetField !== mainSearchField.value && firstHit.otherFields ? firstHit.otherFields[targetField] : firstHit;
	const { annotation, context } = criterium;
	const snippet = snippetParts(hitInField, colors.value, customizations.matchInfoHighlightStyle);

	const removeListMatchInfo = (token: HitToken) => (token.captureAndRelation = token.captureAndRelation?.filter(c => !c.key.includes('[')));
	snippet.before.forEach(removeListMatchInfo);
	snippet.match.forEach(removeListMatchInfo);
	snippet.after.forEach(removeListMatchInfo);

	const position = context.type === 'positional' ? context.position : undefined;
	let start = Number.MAX_SAFE_INTEGER;
	let end = -Number.MAX_SAFE_INTEGER;
	if (context.type === 'positional') {
		if (context.whichTokens === 'all') {
			start = 0;
			end = Number.MAX_SAFE_INTEGER;
		} else if (context.whichTokens === 'first') {
			start = end = 0;
		} else {
			start = context.start! - 1;
			end = context.end! - 1;
		}

		if (position === 'E' || position === 'B') {
			const sectionLength = position === 'E' ? snippet.match.length : snippet.before.length;
			[start, end] = [sectionLength - end - 1, sectionLength - start - 1];
		}
	}

	const isActiveIndex = (index: number) => index >= start && index <= end;
	const isActiveRelationOrCapture = (token: HitToken) => {
		const grouped = token.captureAndRelation?.find(c => c.key === selectedCriteriumAsLabel.value?.context.label);
		if (!grouped) return false;
		return selectedCriteriumAsLabel.value?.context.relation === 'source' ? grouped.isSource : selectedCriteriumAsLabel.value?.context.relation === 'target' ? grouped.isTarget : true;
	};
	const getPreviewStyle = (token: HitToken): object =>
		token.captureAndRelation?.length
			? {
					background: `linear-gradient(90deg, ${token.captureAndRelation.map((capture, i) => `${capture.highlight.color} ${(i / token.captureAndRelation!.length) * 100}%, ${capture.highlight.color} ${((i + 1) / token.captureAndRelation!.length) * 100}%`)})`,
					color: token.captureAndRelation[0].highlight.textcolor,
					textShadow: `0 0 1.25px ${token.captureAndRelation[0].highlight.textcolorcontrast},`.repeat(10).replace(/,$/, ''),
					cursor: 'pointer',
				}
			: {};
	const mapSection = (tokens: HitToken[], isActive: (token: HitToken, index: number) => boolean) =>
		tokens.map((token, index) => ({
			word: (token.punctBefore || '') + token.annotations[wordAnnotation] || '·',
			wordAsHtml,
			selectedAnnotation: token.annotations[annotation!] || '·',
			selectedAnnotationAsHtml: annotation === wordAnnotation && wordAsHtml,
			punct: token.punct,
			active: isActive(token, index),
			style: getPreviewStyle(token),
			captureAndRelation: token.captureAndRelation,
		}));

	return [
		mapSection(snippet.before, (token, index) => (position === 'B' && isActiveIndex(index)) || isActiveRelationOrCapture(token)),
		mapSection(snippet.match, (token, index) => ((position === 'H' || position === 'E') && isActiveIndex(index)) || isActiveRelationOrCapture(token)),
		mapSection(snippet.after, (token, index) => (position === 'A' && isActiveIndex(index)) || isActiveRelationOrCapture(token)),
	];
});

const contextOptions = computed<Options>(() => [
	{ label: translate.$t('results.groupBy.some_words.theFirstWord'), value: 'first' },
	{ label: translate.$t('results.groupBy.some_words.allWords'), value: 'all' },
	{ label: translate.$t('results.groupBy.some_words.specificWords'), value: 'specific' },
	{
		label: translate.$t('results.groupBy.some_words.captureGroupsLabel'),
		options: [
			...relations.value.map(c => ({ label: `<span class="color-ball" style="background-color: ${colors.value[c.label].color};">&nbsp;</span> relation ${c.name}`, value: c.name })),
			...captures.value.map(c => ({ label: `<span class="color-ball" style="background-color: ${colors.value[c.label].color};">&nbsp;</span> capture ${c.name}`, value: c.name })),
		],
	},
]);

const fieldName = computed({
	get: () => selectedCriteriumAsContext.value?.fieldName ?? mainSearchField.value,
	set: (value: string) => {
		const selected = selectedCriteriumAsContext.value;
		if (!selected) return;
		selected.fieldName = value;
		if (selected.context.type !== 'label') return;

		const selectedContext = selected.context as ContextLabel;
		const selectedLabel = selectedContext.label;
		nextTick(() => {
			if (!findOption(contextOptions.value, selectedLabel)) {
				selectedContext.label = 'all';
				return;
			}
			const relationPart = getInitialRelationPartValue(selectedLabel);
			if (relationPart) selectedContext.relation = relationPart;
		});
	},
});

const contextValue = computed({
	get: () => {
		if (selectedCriterium.value?.type !== 'context') return '';
		return selectedCriterium.value.context.type === 'label' ? selectedCriterium.value.context.label : selectedCriterium.value.context.whichTokens;
	},
	set: (value: string) => {
		const selected = selectedCriterium.value;
		if (selected?.type !== 'context') return;
		if (value === 'first' || value === 'all' || value === 'specific') {
			if (selectedCriteriumAsPositional.value) {
				selectedCriteriumAsPositional.value.context.whichTokens = value;
			} else {
				selected.context = { type: 'positional', position: 'H', whichTokens: value, start: 1, end: contextsize.value };
			}
			if (value === 'all' && selectedCriteriumAsPositional.value?.context.position === 'E') selectedCriteriumAsPositional.value.context.position = 'H';
		} else {
			selected.context = { type: 'label', label: value, relation: relationNames.value.includes(value) ? getInitialRelationPartValue(value) : undefined };
		}
	},
});

const selectedMetadataCriterium = computed({
	get: () => {
		if (selectedCriterium.value?.type !== 'metadata') return '';
		const metadata = selectedCriterium.value.metadata;
		return metadata.type === 'document' ? metadata.field : spanAttributeOptionValue(metadata.spanName, metadata.attributeName);
	},
	set: (value: string) => {
		if (!value || selectedCriterium.value?.type !== 'metadata') return;
		if (!value.startsWith(OPT_PREFIX_SPAN_ATTRIBUTE)) {
			selectedCriterium.value.metadata = { type: 'document', field: value };
		} else {
			const [spanName, attributeName] = JSON.parse(value.slice(OPT_PREFIX_SPAN_ATTRIBUTE.length));
			selectedCriterium.value.metadata = { type: 'span-attribute', spanName, attributeName };
		}
	},
});

const positionOptions = computed<Options>(() => {
	if (!selectedCriteriumAsPositional.value) return [];
	return [
		{ label: translate.$t('results.groupBy.in_this_location.beforeTheHit'), value: 'B' },
		{ label: translate.$t('results.groupBy.in_this_location.inTheHit'), value: 'H' },
		...(selectedCriteriumAsPositional.value.context.whichTokens !== 'all' ? [{ label: translate.$t('results.groupBy.in_this_location.fromTheEnd'), value: 'E' }] : []),
		{ label: translate.$t('results.groupBy.in_this_location.afterTheHit'), value: 'A' },
	];
});
const positionValue = computed({
	get: (): 'B' | 'H' | 'E' | 'A' => selectedCriteriumAsPositional.value?.context.position ?? 'H',
	set: (value: 'B' | 'H' | 'E' | 'A') => {
		if (selectedCriteriumAsPositional.value) selectedCriteriumAsPositional.value.context.position = value;
	},
});

const isParallel = computed(() => corpus.value.isParallelCorpus ?? false);
const parallelVersionOptions = computed<Option[]>(() => {
	const summary = results?.summary;
	const pattern = hasPatternInfo(summary) ? summary.pattern : undefined;
	return (pattern ? [pattern.fieldName, ...(pattern.otherFields ?? [])] : []).map(fieldName => {
		const field = corpus.value.parallelAnnotatedFieldsMap[fieldName];
		return { value: field.id, label: translate.$tAnnotatedFieldDisplayName(field) };
	});
});

function apply() {
	storeValueUpdateIsOurs.value = true;
	storeModule.value.actions.groupBy(serializeSortByOrGroupBy(addedCriteria.value.filter(isValidGroupBy)));
}
/** Remove a tab while keeping the selected criterium aligned with its predecessor. */
function removeGroup(index: number) {
	if (selectedCriteriumIndex.value >= index) selectedCriteriumIndex.value--;
	addedCriteria.value.splice(index, 1);
}
function clear() {
	addedCriteria.value = [];
	selectedCriteriumIndex.value = -1;
	active.value = false;
	if (storeValue.value.length) apply();
}
function addAnnotation() {
	addedCriteria.value.push({
		type: 'context',
		fieldName: mainSearchField.value,
		annotation: defaultAnnotation.value,
		context: { type: 'positional', position: 'H', whichTokens: 'all', start: 1, end: contextsize.value },
		caseSensitive: false,
	});
	selectedCriteriumIndex.value = addedCriteria.value.length - 1;
}
function addMetadata() {
	addedCriteria.value.push({ type: 'metadata', caseSensitive: false, metadata: { type: 'document', field: '' } });
	selectedCriteriumIndex.value = addedCriteria.value.length - 1;
}
function handlePreviewClick(event: MouseEvent, section: number, index: number) {
	const token = preview.value[section][index];
	if (!token.captureAndRelation?.length || selectedCriterium.value?.type !== 'context') return;

	const elementRect = (event.target as HTMLElement).getBoundingClientRect();
	const clickPosition = event.pageX - (elementRect.left + window.scrollX);
	const relationIndex = Math.max(0, Math.min(Math.floor((clickPosition / elementRect.width) * token.captureAndRelation.length), token.captureAndRelation.length - 1));
	const relation = token.captureAndRelation[relationIndex];
	selectedCriterium.value.context = {
		type: 'label',
		label: relation.key,
		relation: relation.isSource ? 'source' : relation.isTarget ? 'target' : undefined,
	};
}
function relationPartByClass(part: 'source' | 'target' | 'label') {
	const relationName = selectedCriteriumAsLabel.value?.context.label;
	const relation = relationName ? (hits.value?.hits[0].matchInfos?.[relationName] as BLMatchInfoRelation) : null;
	if (relation?.relClass) {
		const translated = translate.$td(`results.groupBy.relationPartByClass.${relation.relClass}.${part}`, null);
		if (translated !== null) return translated;
	}
	return translate.$t(`results.groupBy.relationPartByClass.default.${part}`);
}
function relationSourceInThisField(matchInfo: BLSummaryMatchInfo) {
	const field = matchInfo.fieldName ?? mainSearchField.value;
	return !selectedCriteriumAsContext.value?.fieldName || field === selectedCriteriumAsContext.value.fieldName;
}
function relationTargetInThisField(matchInfo: BLSummaryMatchInfo) {
	const field = matchInfo.targetField ?? mainSearchField.value;
	return !selectedCriteriumAsContext.value?.fieldName || field === selectedCriteriumAsContext.value.fieldName;
}
function relationMatchInfoDefByLabel(label: string): BLSummaryMatchInfo {
	return hits.value?.summary?.pattern?.matchInfos?.[label] ?? { type: 'span' };
}
function getInitialRelationPartValue(relationName: string) {
	const matchInfo = relationMatchInfoDefByLabel(relationName);
	const source = relationSourceInThisField(matchInfo);
	const target = relationTargetInThisField(matchInfo);
	return source === target ? undefined : source ? 'source' : 'target';
}

watch(
	storeValue,
	value => {
		if (storeValueUpdateIsOurs.value) {
			storeValueUpdateIsOurs.value = false;
			return;
		}
		addedCriteria.value = parseGroupBy(value, results ?? undefined);
		active.value ||= addedCriteria.value.length > 0;
		if (selectedCriteriumIndex.value >= addedCriteria.value.length) selectedCriteriumIndex.value = addedCriteria.value.length - 1;
	},
	{ immediate: true },
);
</script>

<style lang="scss">
.case-and-context {
	display: flex;
	flex-direction: row;
	justify-content: space-between;
	align-items: center;
	padding: 10px 0 0 0;

	> .labels {
		padding-right: 10px;
		flex-shrink: 1;
		flex-basis: auto;
		> * {
			margin-bottom: 0.5em;
			display: block;
			line-height: 30px;
		}
	}
	> .inputs {
		flex-grow: 1;
		flex-basis: auto;
		> * {
			margin-bottom: 0.5em;
			height: 30px;
			display: block;
		}
	}
}

.hit-preview {
	overflow: auto;
	border-radius: 0;

	display: flex;
	flex-wrap: nowrap;
	justify-content: safe center;

	/**
		Container for a word in the preview.
		It has the word at the top, and hovering just below it, the annotation's value
	*/
	.word {
		font-size: 125%;
		flex: none;
		overflow: hidden; // hide the annotation if it's too long.
		position: relative;
		padding-bottom: 0.5em; // space for the annotation value that hovers below the word.

		// Always round the borders of inactive words
		// Otherwise highlights look bad.
		// (active words have their own border radius logic.)
		&:not(.active) {
			border-radius: 6px;
		}
	}

	/** In between words. Is separate from the word container because in the past words could be shrunk, but punctuation was exempt from that. */
	.punct {
		flex: none;
		white-space: pre;
	}

	.word > .main {
		white-space: nowrap;
	}

	.word > .annotation {
		font-size: 75%;
		opacity: 0.75;
		font-style: italic;
		position: absolute;
		left: 0.5em;
		bottom: 0;
		white-space: nowrap;
	}

	.separator {
		flex: none;
		width: 2px;
		height: auto;
		margin: 0 0.5em;
		background: #555;
		border-radius: 2px;
	}

	.active {
		border-top: 1px solid black;
		border-bottom: 1px solid black;
	}

	// An active word
	.active:first-of-type {
		border-left: 1px solid black;
		border-top-left-radius: 6px;
		border-bottom-left-radius: 6px;
	}

	// An active word
	.active:last-of-type {
		border-right: 1px solid black;
		border-top-right-radius: 6px;
		border-bottom-right-radius: 6px;
	}
}

.color-ball {
	border-radius: 100%;
	width: 16px;
	height: 16px;

	display: inline-block;
	vertical-align: center;
}

.remove-group-button {
	opacity: 0;
	border: none;
	padding: 0;
	background: none;
	padding-left: 0.25em;
}

.tab {
	&.active,
	&:hover,
	&:focus,
	&:active,
	&:focus-within {
		.remove-group-button {
			opacity: 1;
			pointer-events: all;
		}
	}
}
</style>
