<template>
	<div>
		<h3>{{ $t('search.heading') }}</h3>
		<ul class="nav nav-tabs" id="searchTabs">
			<li :class="{ active: activePattern === 'simple' }" @click.prevent="activePattern = 'simple'">
				<a href="#simple" class="querytype">{{ $t('search.simple.heading') }}</a>
			</li>
			<!-- <li :class="{'active': activePattern==='extended'}" @click.prevent="activePattern='extended'"><a href="#extended" class="querytype">{{$t('search.extended.heading')}}</a></li>
			<li v-if="advancedEnabled" :class="{'active': activePattern==='advanced'}" @click.prevent="activePattern='advanced'" ><a href="#advanced" class="querytype">{{$t('search.advanced.heading')}}</a></li>
			<li :class="{'active': activePattern==='expert'}" @click.prevent="activePattern='expert'"><a href="#expert" class="querytype">{{$t('search.expert.heading')}}</a></li> -->
		</ul>
		<div class="tab-content" :class="{ parallel: parallel.isParallelCorpus }">
			<div :class="['tab-pane form-horizontal', { active: activePattern === 'simple' }]" id="simple">
				<ParallelSourceAndTargets v-if="parallel.isParallelCorpus" block lg :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />
				<!-- TODO render the full annotation instance? requires some changes to bind to store correctly and apply appropriate classes though -->
				<div class="form-group form-group-lg">
					<label class="control-label" :for="simpleSearchAnnotation.id + '_' + uid" :title="$tAnnotDescription(simpleSearchAnnotation)">{{ $tAnnotDisplayName(simpleSearchAnnotation) }} </label>
					<Annotation :key="'simple/' + simpleSearchAnnotation.id" :htmlId="'simple/' + simpleSearchAnnotation.id" :annotation="simpleSearchAnnotation" bare simple />
				</div>
			</div>
			<!-- <div :class="['tab-pane form-horizontal', {'active': activePattern==='extended'}]" id="extended">
				<ParallelSourceAndTargets v-if="parallel.isParallelCorpus" :errorNoParallelSourceVersion="errorNoParallelSourceVersion"/>
				<template v-if="useTabs">
					<ul class="nav nav-tabs subtabs" style="padding-left: 15px">
						<li v-for="tab in tabs" :class="{'active': activeAnnotationTab === tab.id}" :key="tab.id">
							<a :href="'#'+tab.id" @click.prevent="activeAnnotationTab = tab.id">{{tab.label}}</a>
						</li>
					</ul>
					<div class="tab-content">
						<div v-for="tab in tabs"
							:class="['tab-pane', 'annotation-container', {'active': activeAnnotationTab === tab.id}]"
							:key="tab.id"
							:id="tab.id"
						>
							<Annotation v-for="annotation in tab.entries"
								:key="tab.id + '/' + annotation.id"
								:htmlId="
									/* Cannot can exist in multiple tabs - keep unique. 
									Also don't include annotatedFieldId, because that would reset the input field when changing parallel source version, 
									which is undesirable since the annotation itself doesn't change, only the autocomplete options */
									tab.id + '/' + annotation.id
								"
								:annotation="annotation"
							/>
						</div>
					</div>
				</template>
				<template v-else>
					<Annotation v-for="annotation in allAnnotations"
						:key="annotation.id"
						:htmlId="annotation.id"
						:annotation="annotation"
					/>
				</template>

				<Within/>

				

				<button v-if="useTabs || allAnnotations.length > 1" type="button" class="btn btn-default btn-sm" @click="copyExtendedQuery">{{$t('search.advanced.copyAdvancedQuery')}}</button>
			</div> -->
			<!-- <div v-if="advancedEnabled" :class="['tab-pane', {'active': activePattern==='advanced'}]" id="advanced">
				<SearchAdvanced :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />
			</div> -->
			<!-- <div :class="['tab-pane', {'active': activePattern==='expert'}]" id="expert">
				<SearchExpert :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />

				<button v-if="advancedEnabled" type="button" class="btn btn-sm btn-default" name="parseQuery" id="parseQuery"
					:title="$t('search.expert.parseQueryTitle').toString()"
					@click="parseQuery">{{$t('search.expert.parseQuery')}}</button>
				<label class="btn btn-sm btn-default file-input-button" for="importQuery">
					{{$t('search.expert.importQuery')}}
					<input type="file" name="importQuery" id="importQuery" accept=".txt,text/plain" @change="importQuery" :title="$t('search.expert.importQueryTitle')">
				</label>
				<div class="btn-group">
					<label class="btn btn-sm btn-default file-input-button" for="gapFilling">
						{{$t('search.expert.gapFilling')}}
						<input type="file" name="gapFilling" id="gapFilling" accept=".tsv,.csv,text/plain" @change="importGapFile" :title="$t('search.expert.gapFillingTitle')">
					</label>
					<button v-if="gapValue != null"
						type="button"
						class="btn btn-default btn-sm"
						:title="$t('search.expert.clearGapValues').toString()"
						@click="gapValue = null"
					><span class="fa fa-times"></span></button>
				</div>
				<textarea type="area" v-if="gapValue != null" class="form-control gap-value-editor" v-model.lazy="gapValue" @keydown.tab.prevent="insertTabInText"/>
				<span v-show="parseQueryError" id="parseQueryError" class="text-danger"><span class="fa fa-exclamation-triangle"></span> {{parseQueryError}}</span>
				<span v-show="importQueryError" id="importQueryError" class="text-danger"><span class="fa fa-exclamation-triangle"></span> {{importQueryError}}</span>

			</div> -->
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { useBlackLabApi } from '@/_new/app/plugins/installApi';
import * as CorpusStore from '@/_new/features/corpus/store/corpus-store';
// import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/_new/pages/search/config/ui-customization-store';
import useParallel from '@/_new/pages/search/form/composables/useParallel';
// import * as HistoryStore from '@/features/history/model/query-history-state';
// import * as FilterStore from '@/features/search/model/form/filter-state';
// import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/_new/pages/search/form/store/interface-state';
import * as PatternStore from '@/_new/pages/search/form/store/pattern-store';
import { getPatternStringFromCql } from '@/_new/pages/search/form/utils/pattern-utils';
import type { NormalizedAnnotation } from '@/_new/types/apptypes';
import { getQueryBuilderStateFromParsedQuery } from '@/_new/widgets/cql-query-builder/model';

import { type Result, parseBcql } from '@/_new/shared/blacklab-helpers/cql/bcql-json-interpreter';
import { getAnnotationSubset } from '@/_new/shared/blacklab-helpers/field-groups';
import { useI18n } from '@/_new/shared/i18n/i18n';
import useUid from '@/_new/shared/utils/useUid';

import Annotation from '@/_new/pages/search/form/annotations/Annotation.vue';
import ParallelSourceAndTargets from '@/_new/pages/search/form/parallel/ParallelSourceAndTargets.vue';

// import uid from '@/mixins/uid';
// import Annotation from '@/pages/search/form/Annotation.vue';
// import ParallelSourceAndTargets from '@/pages/search/form/ParallelSourceAndTargets.vue';
// import SearchAdvanced from '@/pages/search/form/SearchAdvanced.vue';
// import SearchExpert from '@/pages/search/form/SearchExpert.vue';
// import Within from '@/pages/search/form/Within.vue';

// import type * as AppTypes from '@/types/apptypes';
// import { getAnnotationSubset } from '@/utils';

// import { useBlackLabApi } from '@/_new/app/plugins/installApi';
// import type { CqlQueryBuilderData } from '@/components/cql/cql-types';
// import { getQueryBuilderStateFromParsedQuery } from '@/components/cql/cql-types';
// import type { Result } from '@/utils/bcql-json-interpreter';
// import { parseBcql } from '@/utils/bcql-json-interpreter';
// import { corpusCustomizations } from '@/utils/customization';
// import type { Option } from '@/_new/utils/options/options';
// import { getPatternStringFromCql, getPatternStringSearch } from '@/utils/pattern-utils';
// import ParallelFields from '../../../../../../../old-frontend/pages/search/form/parallel/ParallelFields';

const props = withDefaults(
	defineProps<{
		errorNoParallelSourceVersion: boolean;
	}>(),
	{
		errorNoParallelSourceVersion: false,
	},
);

const translate = useI18n();
const parallel = useParallel();

const uid = useUid();
const parseQueryError = ref<string | null>(null);
const importQueryError = ref<string | null>(null);

const blacklab = useBlackLabApi();

const activePattern = computed<InterfaceStore.ModuleRootState['patternMode']>({
	get: InterfaceStore.get.patternMode,
	set: InterfaceStore.actions.patternMode,
});
const activeAnnotationTab = computed<InterfaceStore.ModuleRootState['activeAnnotationTab']>({
	get: InterfaceStore.get.activeAnnotationTab,
	set: InterfaceStore.actions.activeAnnotationTab,
});

type AnnotationTab = { label: string; id: string; entries: NormalizedAnnotation[] };
const tabs = computed<AnnotationTab[]>(() => {
	const result = getAnnotationSubset(
		UIStore.getState().search.extended.searchAnnotationIds,
		CorpusStore.get.annotationGroups(),
		CorpusStore.get.allAnnotationsMap(),
		'Search',
		translate,
		CorpusStore.get.textDirection(),
	).map(group => ({
		...group,
		label: group.label!,
		id: group.label!.replace(/[^\w]/g, '_') + '_annotations',
	}));
	if (parallel.isParallelCorpus) {
		// Make sure we have the correct field, so autosuggest works properly
		const versionSelected = PatternStore.getState().shared.source !== null;
		const field = PatternStore.getState().shared.source ?? CorpusStore.get.mainAnnotatedField();
		const fieldId = CorpusStore.get.allAnnotatedFieldsMap()[field]?.id;
		if (fieldId) {
			result.forEach(tab => {
				tab.entries = tab.entries.map(e => ({
					...e,
					annotatedFieldId: versionSelected ? field : '', // no autocomplete if no version selected
				}));
			});
		}
	}
	return result;
});
const useTabs = computed(() => tabs.value.length > 1);
const allAnnotations = computed(() => tabs.value.flatMap(tab => tab.entries));
const simpleSearchAnnotation = computed<NormalizedAnnotation>(() => {
	const annotatedField = CorpusStore.get.allAnnotatedFieldsMap()[parallel.sourceFieldModel];
	const annotationId = UIStore.getState().search.simple.searchAnnotationId;
	return annotatedField.annotations[annotationId];
});

// advancedEnabled(): boolean { return UIStore.getState().search.advanced.enabled; },
// advanced: {
// 	get(): CqlQueryBuilderData|null { return PatternStore.getState().advanced.query; },
// 	set: PatternStore.actions.advanced.query,
// },

// const gapValue = computed<string|null>({
// get: GapStore.get.gapValue,
// set: GapStore.actions.gapValue
// });

// function copyExtendedQuery() {
// 	const patternState = PatternStore.getState();
// 	const filterState = FilterStore.getState();
// 	const q = getPatternStringSearch('extended', patternState, UIStore.getState().search.shared.alignBy.defaultValue, filterState.filters);
// 	PatternStore.actions.expert.query(q || '');
// 	InterfaceStore.actions.patternMode('expert');
// };

async function parseQuery() {
	// retrieve the expert query (which presumably is active atm because the button was visible)

	// Can't just use the string, we need to generate the query when this is a parallel corpus

	const mainAnnotationId = CorpusStore.get.firstMainAnnotation().id;
	const builtQuery = getPatternStringFromCql(
		PatternStore.getState().expert.query || '',
		{}, // skip within - it's shared between tabs anyway so should already be present
		PatternStore.getState().shared.targets,
		PatternStore.getState().expert.targetQueries,
		PatternStore.getState().shared.alignBy,
	);
	let parsed: Result[] | null = null;
	try {
		parsed = await parseBcql(useBlackLabApi(), CorpusStore.get.indexId()!, builtQuery, mainAnnotationId);
	} catch {}
	if (!parsed) {
		parseQueryError.value = 'The querybuilder could not parse your query.';
		return;
	}

	const queryBuilderState = getQueryBuilderStateFromParsedQuery(parsed);
	PatternStore.actions.advanced.query(queryBuilderState.query);
	PatternStore.actions.advanced.targetQueries(queryBuilderState.targetQueries);
	InterfaceStore.actions.patternMode('advanced');

	parseQueryError.value = null;
	return;
}

// function importQuery(event: Event) {
// 	const el = event.target as HTMLInputElement;
// 	if (!el.files || el.files.length !== 1) {
// 		return;
// 	}

// 	const file = el.files[0];
// 	HistoryStore.get
// 		.fromFile(file)
// 		.then(r => {
// 			RootStore.actions.replace(r.entry);
// 			this.importQueryError = null;
// 		})
// 		.catch(e => (this.importQueryError = e.message))
// 		.finally(() => (el.value = ''));
// }

// function importGapFile(event: Event) {
// 	const el = event.target as HTMLInputElement;
// 	if (!el.files || el.files.length !== 1) {
// 		this.gapValue = null;
// 		return;
// 	}
// 	GapStore.actions.gapValueFile(el.files[0]);
// 	el.value = '';
// }
function insertTabInText(event: Event) {
	const el = event.target as HTMLTextAreaElement;
	let text = el.value;

	const originalSelectionStart = el.selectionStart;
	const originalSelectionEnd = el.selectionEnd;
	const textStart = text.slice(0, originalSelectionStart);
	const textEnd = text.slice(originalSelectionEnd);

	el.value = `${textStart}\t${textEnd}`;
	el.selectionEnd = el.selectionStart = originalSelectionStart + 1;
}
/** Tabs can be set to null or invalid value when decoding existing URL. Validate and correct it if required */
function synchronizeActiveTab() {
	if (activeAnnotationTab.value == null || !tabs.value.find(t => t.id === activeAnnotationTab.value)) activeAnnotationTab.value = tabs.value[0]?.id ?? null;
}

function autocompleteSimpleSearch(q: string): Promise<string[]> {
	return blacklab.getTermAutocomplete(CorpusStore.get.indexId()!, simpleSearchAnnotation.value.annotatedFieldId, simpleSearchAnnotation.value.id, q);
}

watch(
	[tabs, activeAnnotationTab],
	_ => {
		synchronizeActiveTab();
	},
	{ immediate: true },
);
</script>

<style lang="scss">
.querybuilder {
	background-color: rgba(255, 255, 255, 0.7);
	border-radius: 4px;
	box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075);
	border: 1px solid #ccc;
	margin-bottom: 10px;

	.close {
		opacity: 0.4; // make close buttons a little more visible
		&:hover,
		&:focus {
			opacity: 0.6;
		}
	}
}

.parallel .qb-par-wrap {
	background-color: rgba(255, 255, 255, 0.7);
	border-radius: 4px;
	box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.075);
	border: 1px solid #ccc;
	margin-bottom: 10px;
	padding: 20px;

	label.control-label {
		margin: 0 0 20px 0;
	}

	.querybuilder {
		border: 0;
		box-shadow: none;
		margin-bottom: 0;
		&.bl-querybuilder-root {
			padding: 0;
		}
	}
}

.error {
	color: red;
	margin: 0.5em 0 0 1em;
	font-weight: bold;
}

#simple .form-group {
	margin-right: auto;
	margin-left: auto;
	max-width: 1170px;
}

// Some bootstrap tab customization
.nav-tabs.subtabs {
	// border-bottom: none;
	margin-top: -10px;

	> li {
		margin-bottom: -1px;
		border-bottom: transparent;

		> a {
			padding: 4px 15px;
		}

		&.active > a,
		> a:hover {
			border-color: #ddd #ddd transparent #ddd;
		}
	}
}

textarea.gap-value-editor {
	margin-top: 10px;
	height: 300px;
	max-width: 100%;
	resize: vertical;
	width: 100%;
}

.annotation-container {
	max-height: 385px; // 5 fields @ 74px + 15px padding
	overflow: auto;
	overflow-x: hidden;
	margin-bottom: 15px;
}

div.attr {
	margin-top: 4px;
	label,
	input {
		width: 6em;
	}
}
</style>
