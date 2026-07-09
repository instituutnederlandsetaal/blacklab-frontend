<template>
	<div>
		<h3>{{ $t('search.heading') }}</h3>
		<ul class="nav nav-tabs" id="searchTabs">
			<li :class="{ active: activePattern === 'simple' }" @click.prevent="activePattern = 'simple'">
				<a href="#simple" class="querytype">{{ $t('search.simple.heading') }}</a>
			</li>
			<li :class="{ active: activePattern === 'extended' }" @click.prevent="activePattern = 'extended'">
				<a href="#extended" class="querytype">{{ $t('search.extended.heading') }}</a>
			</li>
			<li v-if="advancedEnabled" :class="{ active: activePattern === 'advanced' }" @click.prevent="activePattern = 'advanced'">
				<a href="#advanced" class="querytype">{{ $t('search.advanced.heading') }}</a>
			</li>
			<li :class="{ active: activePattern === 'expert' }" @click.prevent="activePattern = 'expert'">
				<a href="#expert" class="querytype">{{ $t('search.expert.heading') }}</a>
			</li>
		</ul>
		<div class="tab-content" :class="{ parallel: isParallelCorpus }">
			<div :class="['tab-pane form-horizontal', { active: activePattern === 'simple' }]" id="simple">
				<FormSystem v-if="renderNewForm('simple')" :definition="checkedSearchFormDefinition" :root-id="newSearchFormId('simple')" @submit="submitNewForm" @reset="resetNewForm" />
				<template v-else>
					<ParallelSourceAndTargets v-if="isParallelCorpus" block lg :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />
					<!-- TODO render the full annotation instance? requires some changes to bind to store correctly and apply appropriate classes though -->
					<div class="form-group form-group-lg">
						<label class="control-label" :for="simpleSearchAnnotation.id + '_' + uid" :title="$tAnnotDescription(simpleSearchAnnotation)">{{ $tAnnotDisplayName(simpleSearchAnnotation) }} </label>
						<Annotation :key="'simple/' + simpleSearchAnnotation.id" :htmlId="'simple/' + simpleSearchAnnotation.id" :annotation="simpleSearchAnnotation" bare simple />
					</div>
				</template>
			</div>
			<div :class="['tab-pane form-horizontal', { active: activePattern === 'extended' }]" id="extended">
				<FormSystem v-if="renderNewForm('extended')" :definition="checkedSearchFormDefinition" :root-id="newSearchFormId('extended')" @submit="submitNewForm" @reset="resetNewForm" />
				<template v-else>
					<ParallelSourceAndTargets v-if="isParallelCorpus" :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />
					<template v-if="useTabs">
						<ul class="nav nav-tabs subtabs" style="padding-left: 15px">
							<li v-for="tab in tabs" :class="{ active: activeAnnotationTab === tab.id }" :key="tab.id">
								<a :href="'#' + tab.id" @click.prevent="activeAnnotationTab = tab.id">{{ tab.label }}</a>
							</li>
						</ul>
						<div class="tab-content">
							<div v-for="tab in tabs" :class="['tab-pane', 'annotation-container', { active: activeAnnotationTab === tab.id }]" :key="tab.id" :id="tab.id">
								<!-- 
									The same annotation can be present in multiple tabs - make sure the htmlId is unique.
									Note that we don't use annotatedFieldId in the key, because for parallel,
									we can change the version, but we don't want that to affect the value of
									the input field, only the autocomplete functionality. -->
								<Annotation v-for="annotation in tab.entries" :key="tab.id + '/' + annotation.id" :htmlId="tab.id + '/' + annotation.id" :annotation="annotation" />
							</div>
						</div>
					</template>
					<template v-else>
						<Annotation v-for="annotation in allAnnotations" :key="annotation.id" :htmlId="annotation.id" :annotation="annotation" />
					</template>

					<Within v-model="within" />

					<div v-if="splitBatchEnabled" class="form-group">
						<div class="col-xs-12 col-md-9 col-md-push-3 checkbox">
							<label for="extended_split_batch"> <input type="checkbox" name="extended_split_batch" id="extended_split_batch" v-model="splitBatch" /> {{ $t('search.extended.splitBatch') }} </label>
						</div>
					</div>

					<button v-if="useTabs || allAnnotations.length > 1" type="button" class="btn btn-default btn-sm" @click="copyExtendedQuery">{{ $t('search.advanced.copyAdvancedQuery') }}</button>
				</template>
			</div>
			<div v-if="advancedEnabled" :class="['tab-pane', { active: activePattern === 'advanced' }]" id="advanced">
				<FormSystem v-if="renderNewForm('advanced')" :definition="checkedSearchFormDefinition" :root-id="newSearchFormId('advanced')" @submit="submitNewForm" @reset="resetNewForm" />
				<SearchAdvanced v-else :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />
			</div>
			<div :class="['tab-pane', { active: activePattern === 'expert' }]" id="expert">
				<FormSystem v-if="renderNewForm('expert')" :definition="checkedSearchFormDefinition" :root-id="newSearchFormId('expert')" @submit="submitNewForm" @reset="resetNewForm" />
				<template v-else>
					<SearchExpert :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />

					<!-- Copy to builder, import, gap filling buttons -->
					<button v-if="advancedEnabled" type="button" class="btn btn-sm btn-default" name="parseQuery" id="parseQuery" :title="$t('search.expert.parseQueryTitle').toString()" @click="parseQuery">
						{{ $t('search.expert.parseQuery') }}
					</button>
					<label class="btn btn-sm btn-default file-input-button" for="importQuery">
						{{ $t('search.expert.importQuery') }}
						<input type="file" name="importQuery" id="importQuery" accept=".txt,text/plain" @change="importQuery" :title="$t('search.expert.importQueryTitle')" />
					</label>
					<div class="btn-group">
						<label class="btn btn-sm btn-default file-input-button" for="gapFilling">
							{{ $t('search.expert.gapFilling') }}
							<input type="file" name="gapFilling" id="gapFilling" accept=".tsv,.csv,text/plain" @change="importGapFile" :title="$t('search.expert.gapFillingTitle')" />
						</label>
						<button v-if="gapValue != null" type="button" class="btn btn-default btn-sm" :title="$t('search.expert.clearGapValues').toString()" @click="gapValue = null">
							<span class="fa fa-times"></span>
						</button>
					</div>
					<textarea type="area" v-if="gapValue != null" class="form-control gap-value-editor" v-model.lazy="gapValue" @keydown.tab.prevent="insertTabInText" />
					<span v-show="parseQueryError" id="parseQueryError" class="text-danger"><span class="fa fa-exclamation-triangle"></span> {{ parseQueryError }}</span>
					<span v-show="importQueryError" id="importQueryError" class="text-danger"><span class="fa fa-exclamation-triangle"></span> {{ importQueryError }}</span>
				</template>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import URI from 'urijs';
import { defineComponent } from 'vue';

import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import type { CqlQueryBuilderData } from '@/features/cql-query-builder/model';
import { getQueryBuilderStateFromParsedQuery } from '@/features/cql-query-builder/model';
import { FormSystem, type CompiledFormStateWithSummaries, type FormBuilder } from '@/features/form';
import * as HistoryStore from '@/features/history/model/query-history-state';
import * as FilterStore from '@/features/search/model/form/filter-state';
import * as GapStore from '@/features/search/model/form/gap-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import type { PatternMode } from '@/features/search/model/form/pattern-state';
import * as PatternStore from '@/features/search/model/form/pattern-state';
import * as GlobalViewSettings from '@/features/search/model/results/global-results-state';
import { getNewSearchFormId, useSearchFormSystem } from '@/features/search/model/search-form-system';
import type * as AppTypes from '@/types/apptypes';
import { createUrlStateParserSearchDependencies } from '@/url/url-state-parser-search';

import ParallelFields from './parallel/ParallelFields';

import { useBlackLabApi } from '@/shared/api';
import type { Result } from '@/shared/blacklab-helpers/cql/bcql-json-interpreter';
import { parseBcql } from '@/shared/blacklab-helpers/cql/bcql-json-interpreter';
import { getAnnotationSubset } from '@/shared/blacklab-helpers/field-groups';
import { getPatternStringFromCql, getPatternStringSearch } from '@/shared/blacklab-helpers/pattern-utils';
import useUid from '@/shared/utils/uid';

import Annotation from '@/pages/search/form/Annotation.vue';
import ParallelSourceAndTargets from '@/pages/search/form/ParallelSourceAndTargets.vue';
import SearchAdvanced from '@/pages/search/form/SearchAdvanced.vue';
import SearchExpert from '@/pages/search/form/SearchExpert.vue';
import Within from '@/pages/search/form/Within.vue';

function toRouterPath(url: string): string {
	const relativeUrl = new URI(url).host('').protocol('').port('').toString();
	const context = (CONTEXT_URL || '').replace(/\/+$/, '');
	return !context || !relativeUrl.startsWith(context) ? relativeUrl : relativeUrl.slice(context.length) || '/';
}

export default defineComponent({
	extends: ParallelFields,
	components: {
		FormSystem,
		ParallelSourceAndTargets,
		Annotation,
		SearchAdvanced,
		SearchExpert,
		Within,
	},
	props: {
		errorNoParallelSourceVersion: { default: false, type: Boolean },
	},
	data: () => ({
		uid: useUid(),
		parseQueryError: null as string | null,
		importQueryError: null as string | null,

		subscriptions: [] as Array<() => void>,
		blacklab: useBlackLabApi(),
		searchFormDefinition: useSearchFormSystem(),
	}),
	computed: {
		activePattern: {
			get(): string {
				return InterfaceStore.getState().patternMode;
			},
			set: InterfaceStore.actions.patternMode,
		},
		activeAnnotationTab: {
			get(): string | null {
				return InterfaceStore.getState().activeAnnotationTab;
			},
			set: InterfaceStore.actions.activeAnnotationTab,
		},
		useTabs(): boolean {
			return this.tabs.length > 1;
		},
		tabs(): Array<{ label: string; id: string; entries: AppTypes.NormalizedAnnotation[] }> {
			const result = getAnnotationSubset(UIStore.getState().search.extended.searchAnnotationIds, this.corpus.annotationGroups, this.corpus.allAnnotationsMap, 'Search', this).map(group => ({
				...group,
				label: group.label!,
				id: group.label!.replace(/[^\w]/g, '_') + '_annotations',
			}));
			if (this.isParallelCorpus) {
				// Make sure we have the correct field, so autosuggest works properly
				const versionSelected = PatternStore.getState().shared.source !== null;
				const field = PatternStore.getState().shared.source ?? this.corpus.mainAnnotatedField;
				const fieldId = this.corpus.allAnnotatedFieldsMap[field]?.id;
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
		},
		allAnnotations(): AppTypes.NormalizedAnnotation[] {
			return this.tabs.flatMap(tab => tab.entries);
		},
		simpleSearchAnnotation(): AppTypes.NormalizedAnnotation {
			const field = this.isParallelCorpus ? PatternStore.getState().shared.source : this.corpus.mainAnnotatedField;
			const id = UIStore.getState().search.simple.searchAnnotationId;
			const annotField = field ?? this.corpus.mainAnnotatedField;
			const result = this.corpus.allAnnotatedFieldsMap[annotField]?.annotations[id] || this.corpus.firstMainAnnotation;
			return {
				...result,
				annotatedFieldId: field ?? '', // no autocomplete if no parallel version selected
			};
		},
		within: {
			get(): string | null {
				return PatternStore.getState().shared.within;
			},
			set: PatternStore.actions.shared.within,
		},
		splitBatchEnabled(): boolean {
			return UIStore.getState().search.extended.splitBatch.enabled && !this.isParallelCorpus; // hide for parallel
		},
		splitBatch: {
			get(): boolean {
				return PatternStore.getState().extended.splitBatch;
			},
			set: PatternStore.actions.extended.splitBatch,
		},
		simple: {
			get(): AppTypes.AnnotationValue {
				return PatternStore.getState().simple.annotationValue;
			},
			set: PatternStore.actions.simple.annotation,
		},
		advancedEnabled(): boolean {
			return UIStore.getState().search.advanced.enabled;
		},
		advanced: {
			get(): CqlQueryBuilderData | null {
				return PatternStore.getState().advanced.query;
			},
			set: PatternStore.actions.advanced.query,
		},
		checkedSearchFormDefinition(): FormBuilder {
			if (!this.searchFormDefinition) throw new Error('New search form definition is not available.');
			return this.searchFormDefinition;
		},
		gapValue: {
			get: GapStore.get.gapValue,
			set: GapStore.actions.gapValue,
		},
	},
	methods: {
		newSearchFormId(patternMode: PatternMode): string {
			return getNewSearchFormId(patternMode);
		},
		renderNewForm(patternMode: PatternMode): boolean {
			const isEnabled = GlobalViewSettings.getState().useNewSearchForm;
			return isEnabled && this.searchFormDefinition?.getForm(getNewSearchFormId(patternMode)) != null;
		},
		submitNewForm(_formId: string, snapshot: CompiledFormStateWithSummaries) {
			RootStore.actions.searchFromSubmit(snapshot);
		},
		resetNewForm() {
			RootStore.actions.reset();
		},
		copyExtendedQuery() {
			const patternState = PatternStore.getState();
			const filterState = FilterStore.getState();
			const q = getPatternStringSearch('extended', patternState, UIStore.getState().search.shared.alignBy.defaultValue, filterState.filters);
			PatternStore.actions.expert.query(q || '');
			InterfaceStore.actions.patternMode('expert');
		},
		async parseQuery() {
			// retrieve the expert query (which presumably is active atm because the button was visible)

			// Can't just use the string, we need to generate the query when this is a parallel corpus

			const mainAnnotationId = this.corpus.firstMainAnnotation.id;
			const builtQuery = getPatternStringFromCql(
				PatternStore.getState().expert.query || '',
				{}, // skip within for now?
				PatternStore.getState().shared.targets,
				PatternStore.getState().expert.targetQueries,
				PatternStore.getState().shared.alignBy,
			);
			let parsed: Result[] | null = null;
			try {
				parsed = await parseBcql(this.blacklab, this.corpus.id!, builtQuery, mainAnnotationId);
			} catch {}
			if (!parsed) {
				this.parseQueryError = 'The querybuilder could not parse your query.';
				return;
			}

			const queryBuilderState = getQueryBuilderStateFromParsedQuery(parsed);
			PatternStore.actions.advanced.query(queryBuilderState.query);
			PatternStore.actions.advanced.targetQueries(queryBuilderState.targetQueries);
			InterfaceStore.actions.patternMode('advanced');

			this.parseQueryError = null;
			return;
		},
		importQuery(event: Event) {
			const el = event.target as HTMLInputElement;
			if (!el.files || el.files.length !== 1) {
				return;
			}

			const file = el.files[0];
			HistoryStore.get
				.fromFile(
					file,
					createUrlStateParserSearchDependencies({
						blacklabApi: this.blacklab,
						corpus: this.corpus,
					}),
				)
				.then(async r => {
					if (r.url) await this.$router.push(toRouterPath(r.url));
					else RootStore.actions.replace(r.entry);
					this.importQueryError = null;
				})
				.catch(e => (this.importQueryError = e.message))
				.finally(() => (el.value = ''));
		},
		importGapFile(event: Event) {
			const el = event.target as HTMLInputElement;
			if (!el.files || el.files.length !== 1) {
				this.gapValue = null;
				return;
			}
			GapStore.actions.gapValueFile(el.files[0]);
			el.value = '';
		},
		insertTabInText(event: Event) {
			const el = event.target as HTMLTextAreaElement;
			let text = el.value;

			const originalSelectionStart = el.selectionStart;
			const originalSelectionEnd = el.selectionEnd;
			const textStart = text.slice(0, originalSelectionStart);
			const textEnd = text.slice(originalSelectionEnd);

			el.value = `${textStart}\t${textEnd}`;
			el.selectionEnd = el.selectionStart = originalSelectionStart + 1;
		},
		/** Tabs can be set to null or invalid value when decoding existing URL. Validate and correct it if required */
		synchronizeActiveTab() {
			if (this.activeAnnotationTab == null || !this.tabs.find(t => t.id === this.activeAnnotationTab)) this.activeAnnotationTab = this.tabs[0]?.id ?? null;
		},
	},
	watch: {
		tabs: {
			handler() {
				this.synchronizeActiveTab();
			},
			immediate: true,
		},
		activeAnnotationTab: {
			handler() {
				this.synchronizeActiveTab();
			},
			immediate: true,
		},
	},
});
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
