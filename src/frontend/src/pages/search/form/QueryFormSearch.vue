<template>
	<div>
		<h3>{{$t('search.heading')}}</h3>
		<ul class="nav nav-tabs" id="searchTabs">
			<li :class="{'active': activePattern==='simple'}" @click.prevent="activePattern='simple'"><a href="#simple" class="querytype">{{$t('search.simple.heading')}}</a></li>
			<li :class="{'active': activePattern==='extended'}" @click.prevent="activePattern='extended'"><a href="#extended" class="querytype">{{$t('search.extended.heading')}}</a></li>
			<li v-if="advancedEnabled" :class="{'active': activePattern==='advanced'}" @click.prevent="activePattern='advanced'" ><a href="#advanced" class="querytype">{{$t('search.advanced.heading')}}</a></li>
			<li v-if="conceptEnabled" :class="{'active': activePattern==='concept'}" @click.prevent="activePattern='concept'"><a href="#concept" class="querytype">{{$t('search.concept.heading')}}</a></li>
			<li v-if="glossEnabled" :class="{'active': activePattern==='glosses'}" @click.prevent="activePattern='glosses'"><a href="#glosses" class="querytype">{{$t('search.glosses.heading')}}</a></li>
			<li :class="{'active': activePattern==='expert'}" @click.prevent="activePattern='expert'"><a href="#expert" class="querytype">{{$t('search.expert.heading')}}</a></li>
		</ul>
		<div class="tab-content" :class="{ parallel: isParallelCorpus }">
			<div :class="['tab-pane form-horizontal', {'active': activePattern==='simple'}]" id="simple">
				<!-- TODO render the full annotation instance? requires some changes to bind to store correctly and apply appropriate classes though -->
				<div class="form-group form-group-lg">
					<label class="control-label"
						:for="simpleSearchAnnotation.id + '_' + uid"
						:title="$tAnnotDescription(simpleSearchAnnotation)"
					>{{$tAnnotDisplayName(simpleSearchAnnotation)}}
					</label>

					<div v-if="customAnnotations[simpleSearchAnnotation.id]"
						:data-custom-annotation-root="simpleSearchAnnotation.id"
						data-is-simple="true"
						ref="_simple"
					></div>
					<Annotation v-else
						:key="'simple/' + simpleSearchAnnotation.annotatedFieldId + '/' + simpleSearchAnnotation.id"
						:htmlId="'simple/' + simpleSearchAnnotation.annotatedFieldId + '/' + simpleSearchAnnotation.id"
						:annotation="simpleSearchAnnotation"
						bare
						simple
					/>
				</div>
				<ParallelSourceAndTargets v-if="isParallelCorpus" block lg/>
			</div>
			<div :class="['tab-pane form-horizontal', {'active': activePattern==='extended'}]" id="extended">
				<template v-if="useTabs">
					<ul class="nav nav-tabs subtabs" style="padding-left: 15px">
						<li v-for="(tab, index) in tabs" :class="{'active': index === 0}" :key="index">
							<a :href="'#'+getTabId(tab.label)" data-toggle="tab">{{tab.label}}</a>
						</li>
					</ul>
					<div class="tab-content">
						<div v-for="(tab, index) in tabs"
							:class="['tab-pane', 'annotation-container', {'active': index === 0}]"
							:key="index"
							:id="getTabId(tab.label)"
						>
							<template v-for="annotation in tab.entries">
								<div v-if="customAnnotations[annotation.id]"
									:key="getTabId(tab.label) + '/' + annotation.annotatedFieldId + '/' + annotation.id"
									:data-custom-annotation-root="annotation.id"
									:ref="getTabId(tab.label) + '/' + annotation.annotatedFieldId + '/' + annotation.id"
								></div>

								<Annotation v-else
									:key="getTabId(tab.label) + '/' + annotation.annotatedFieldId + '/' + annotation.id"
									:htmlId="getTabId(tab.label) + '/' + annotation.annotatedFieldId + '/' + annotation.id"
									:annotation="annotation"
								/>
							</template>
						</div>
					</div>
				</template>
				<template v-else>
					<template v-for="annotation in allAnnotations">
						<div v-if="customAnnotations[annotation.id]"
							:key="annotation.annotatedFieldId + '/' + annotation.id + '/custom'"
							:data-custom-annotation-root="annotation.id"
							:ref="annotation.annotatedFieldId + '/' + annotation.id"
						></div>

						<Annotation v-else
							:key="annotation.annotatedFieldId + '/' + annotation.id + '/builtin'"
							:htmlId="annotation.annotatedFieldId + '/' + annotation.id"
							:annotation="annotation"
						/>
					</template>
				</template>

				<Within />

				<div v-if="splitBatchEnabled" class="form-group">
					<div class="col-xs-12 col-md-9 col-md-push-3 checkbox">
						<label for="extended_split_batch">
							<input type="checkbox" name="extended_split_batch" id="extended_split_batch" v-model="splitBatch"/> {{$t('search.extended.splitBatch')}}
						</label>
					</div>
				</div>
				<ParallelSourceAndTargets v-if="isParallelCorpus"/>

			</div>
			<div v-if="advancedEnabled" :class="['tab-pane', {'active': activePattern==='advanced'}]" id="advanced">
				<SearchAdvanced	/>
			</div>
			<div v-if="conceptEnabled" :class="['tab-pane', {'active': activePattern==='concept'}]" id="concept">

				<!-- Jesse -->
				<ConceptSearch/>
				<button type="button" class="btn btn-default btn-sm" @click="copyConceptQuery">{{$t('search.concept.copyConceptQuery')}}</button>
			</div>
			<div v-if="glossEnabled" :class="['tab-pane', {'active': activePattern==='glosses'}]" id="glosses">
				<!-- Jesse -->
				<GlossSearch/>
				<div style="margin-top:2em"/>
				<button type="button" class="btn btn-default btn-sm" @click="copyGlossQuery">{{$t('search.glosses.copyGlossQuery')}}</button>
			</div>
			<div :class="['tab-pane', {'active': activePattern==='expert'}]" id="expert">
				<SearchExpert />

				<!-- Copy to builder, import, gap filling buttons -->
				<template>
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
				</template>

			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as RootStore from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';
import * as InterfaceStore from '@/store/search/form/interface';
import * as PatternStore from '@/store/search/form/patterns';
import * as GlossStore from '@/store/search/form/glossStore';
import * as ConceptStore from '@/store/search/form/conceptStore';
import * as GapStore from '@/store/search/form/gap';
import * as HistoryStore from '@/store/search/history';

import Annotation from '@/pages/search/form/Annotation.vue';
import SearchAdvanced from '@/pages/search/form/SearchAdvanced.vue';
import SearchExpert from '@/pages/search/form/SearchExpert.vue';
import ConceptSearch from '@/pages/search/form/concept/ConceptSearch.vue';
import GlossSearch from '@/pages/search/form/concept/GlossSearch.vue';
import ParallelSourceAndTargets from '@/pages/search/form/ParallelSourceAndTargets.vue';
import Within from '@/pages/search/form/Within.vue';
import uid from '@/mixins/uid';

import { blacklabPaths } from '@/api';
import * as AppTypes from '@/types/apptypes';
import { getAnnotationSubset } from '@/utils';

import { Option } from '@/components/SelectPicker.vue';
import { corpusCustomizations } from '@/store/search/ui';

function isVue(v: any): v is Vue { return v instanceof Vue; }
function isJQuery(v: any): v is JQuery { return typeof v !== 'boolean' && v && v.jquery; }

import ParallelFields from './parallel/ParallelFields';

export default ParallelFields.extend({
	components: {
		ParallelSourceAndTargets,
		Annotation,
		SearchAdvanced,
		SearchExpert,
		ConceptSearch,
		GlossSearch,
		Within,
	},
	data: () => ({
		uid: uid(),
		parseQueryError: null as string|null,
		importQueryError: null as string|null,

		subscriptions: [] as Array<() => void>
	}),
	computed: {
		activePattern: {
			get(): string { return InterfaceStore.getState().patternMode; },
			set: InterfaceStore.actions.patternMode,
		},
		useTabs(): boolean {
			return this.tabs.length > 1;
		},
		tabs(): Array<{label?: string, entries: AppTypes.NormalizedAnnotation[]}> {
			return getAnnotationSubset(
				UIStore.getState().search.extended.searchAnnotationIds,
				CorpusStore.get.annotationGroups(),
				CorpusStore.get.allAnnotationsMap(),
				'Search',
				this,
				CorpusStore.get.textDirection()
			);
		},
		allAnnotations(): AppTypes.NormalizedAnnotation[] {
			return this.tabs.flatMap(tab => tab.entries);
		},
		simpleSearchAnnotation(): AppTypes.NormalizedAnnotation {
			const id = UIStore.getState().search.simple.searchAnnotationId;
			return CorpusStore.get.allAnnotationsMap()[id] || CorpusStore.get.firstMainAnnotation();
		},
		simpleSearchAnnoationAutoCompleteUrl(): string { return blacklabPaths.autocompleteAnnotation(INDEX_ID, this.simpleSearchAnnotation.annotatedFieldId, this.simpleSearchAnnotation.id); },
		textDirection: CorpusStore.get.textDirection,
		withinOptions(): Option[] {
			const {enabled, elements} = UIStore.getState().search.shared.within;
			return enabled ? elements.filter(corpusCustomizations.search.within.include) : [];
		},
		within: {
			get(): string|null { return PatternStore.getState().extended.within; },
			set: PatternStore.actions.extended.within,
		},
		splitBatchEnabled(): boolean {
			return UIStore.getState().search.extended.splitBatch.enabled &&
				!this.isParallelCorpus; // hide for parallel
		},
		splitBatch: {
			get(): boolean { return PatternStore.getState().extended.splitBatch; },
			set: PatternStore.actions.extended.splitBatch
		},
		simple: {
			get(): AppTypes.AnnotationValue { return PatternStore.getState().simple.annotationValue; },
			set: PatternStore.actions.simple.annotation,
		},
		advancedEnabled(): boolean { return UIStore.getState().search.advanced.enabled; },
		glossEnabled(): boolean { return GlossStore.get.settings() != null; },
		conceptEnabled(): boolean { return ConceptStore.get.settings() != null; },
		advanced: {
			get(): string|null { return PatternStore.getState().advanced.query; },
			set: PatternStore.actions.advanced.query,
		},
		concept: {
			get(): string|null { return PatternStore.getState().concept; },
			set: PatternStore.actions.concept,
		},
		glosses: {
			get(): string|null { return PatternStore.getState().glosses; },
			set: PatternStore.actions.glosses,
		},
		gapValue: {
			get: GapStore.get.gapValue,
			set: GapStore.actions.gapValue
		},

		customAnnotations() {
			return UIStore.getState().search.shared.customAnnotations;
		}
	},
	methods: {
		getTabId(name?: string) {
			return name?.replace(/[^\w]/g, '_') + '_annotations';
		},
		async parseQuery() {
			const expertQueries = [PatternStore.getState().expert.query, ...PatternStore.getState().expert.targetQueries];

			const queryBuilders = $('.querybuilder').map((_, el) => $(el).data('builder')).get();
			let success = true;
			for (let i = 0; i < queryBuilders.length; i++) {
				const builder = queryBuilders[i];
				if (builder) {
					if (!(await builder.parse(expertQueries[i]))) {
						success = false;
						break;
					}
				}
			}
			if (success) {
				InterfaceStore.actions.patternMode('advanced');
				this.parseQueryError = null;
				return;
			}
			this.parseQueryError = 'The querybuilder could not parse your query.';
		},
		importQuery(event: Event) {
			const el = (event.target as HTMLInputElement);
			if (!el.files || el.files.length !== 1) {
				return;
			}

			const file = el.files[0];
			HistoryStore.get.fromFile(file)
			.then(r => {
				RootStore.actions.replace(r.entry);
				this.importQueryError = null;
			})
			.catch(e => this.importQueryError = e.message)
			.finally(() => el.value = '')
		},
		importGapFile(event: Event) {
			const self = this;
			const el = (event.target as HTMLInputElement);
			if (!el.files || el.files.length !== 1) {
				self.gapValue = null;
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
			const textEnd =  text.slice(originalSelectionEnd);

			el.value = `${textStart}\t${textEnd}`;
			el.selectionEnd = el.selectionStart = originalSelectionStart + 1;
		},

		copyConceptQuery() {
			PatternStore.actions.expert.query(this.concept);
			InterfaceStore.actions.patternMode('expert');
		},
		copyGlossQuery() {
			PatternStore.actions.expert.query(this.glosses);
			InterfaceStore.actions.patternMode('expert');
		},
		setupCustomAnnotation(div: HTMLElement, plugin: NonNullable<UIStore.ModuleRootState['search']['shared']['customAnnotations'][string]>) {
			const annotId = div.getAttribute('data-custom-annotation-root')!;
			const isSimpleAnnotation = div.hasAttribute('data-is-simple');

			const config = CorpusStore.get.allAnnotationsMap()[annotId];
			const value = isSimpleAnnotation ? PatternStore.getState().simple.annotationValue : PatternStore.getState().extended.annotationValues[annotId];

			const {render, update} = plugin;
			const ui = render(config, value, Vue);

			if (typeof ui === 'string') div.innerHTML = ui;
			else if (ui instanceof HTMLElement) div.appendChild(ui);
			else if (isJQuery(ui)) ui.appendTo(div);
			else if (isVue(ui)) ui.$mount(div);

			if (!isVue(ui) && update != null) {
				// setup watcher so custom component is notified of changes to its value by external processes (global form reset, history state restore, etc.)
				RootStore.store.watch(state => value, (cur, prev) => update(cur, prev, div), {deep: true});
			}
		},
		withinAttributes(): Option[] {
			const within = this.within;
			if (!within) return [];

			const option = this.withinOptions.find(o => o.value === within);
			if (!option) return [];

			return (corpusCustomizations.search.within.attributes(option) || [])
				.map(el => typeof el === 'string' ? { value: el } : el);
		},
		withinAttributeValue(option: Option) {
			const value = PatternStore.getState().extended.withinAttributes[option.value];
			return value == null ? '' : value;
		},
		changeWithinAttribute(option: Option, event: Event) {
			const el = event.target as HTMLInputElement;
			PatternStore.actions.extended.setWithinAttribute({ name: option.value, value: el.value });
		},
	},
	watch: {
		customAnnotations: {
			handler() {
				// custom annotation widget setup.
				// listen for changes, so any late registration is also picked up
				Vue.nextTick(() => {
					// intermediate function, check if div is not already initialized, and should actually become the custom component.
					const setup = (key: string, div: Element|Vue) => {
						if (!(div instanceof HTMLElement) || !div.hasAttribute('data-custom-annotation-root') || div.children.length) return;
						const annotId = div.getAttribute('data-custom-annotation-root')!;
						this.setupCustomAnnotation(div, this.customAnnotations[annotId]!)
					}

					// by now our dom should have updates, and the extension point (div) should be present
					// scan to find it.
					Object.entries(this.$refs).forEach(([refId, ref]) => {
						if (Array.isArray(ref)) ref.forEach(r => setup(refId, r));
						else if (ref instanceof HTMLElement) setup(refId, ref);
					});
				})
			},
			immediate: true,
			deep: true
		}
	},
	mounted() {
		if (this.$refs.reset) {
			const eventId = `${PatternStore.namespace}/reset`;

			this.subscriptions.push(RootStore.store.subscribe((mutation, state) => {
				if (this.$refs.reset && mutation.type === eventId) {
					(this.$refs.reset as any).reset();
				}
			}));
		}
	}
})
</script>

<style lang="scss">

.querybuilder {
	background-color: rgba(255, 255, 255, 0.7);
	border-radius: 4px;
	box-shadow: inset 0 1px 1px rgba(0, 0, 0, .075);
	border: 1px solid #ccc;
	margin-bottom: 10px;

	.close {
		opacity: 0.4; // make close buttons a little more visible
		&:hover, &:focus { opacity: 0.6; }
	}
}

.parallel .qb-par-wrap {

	background-color: rgba(255, 255, 255, 0.7);
	border-radius: 4px;
	box-shadow: inset 0 1px 1px rgba(0, 0, 0, .075);
	border: 1px solid #ccc;
	margin-bottom: 10px;
	padding: 20px;

	label.control-label { margin: 0 0 20px 0; }

	.querybuilder {
		border: 0;
		box-shadow: none;
		margin-bottom: 0;
		&.bl-querybuilder-root { padding: 0; }
	}
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

	>li {
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
	label, input { width: 6em; }
}

</style>
