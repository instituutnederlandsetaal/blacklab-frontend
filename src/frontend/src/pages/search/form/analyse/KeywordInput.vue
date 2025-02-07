<template>
	<div>
		<div class="tab-content tab-pane form-horizontal">
			{{$t('analyse.keywordInput.inputMode')}}
			<SelectPicker
				placeholder="Show as"
				data-id="test-alg"
				data-width="80%"
				style="max-width: 200px;"

				hideEmpty
				allowHtml

				:options="keywordModeOptions"
				v-model="keywordMode"
			/>
			<hr>
			<!-- TODO: The code above almost copy from QueryFormSearch.vue, so need be optimized. -->
			<div class="form-group">
				<div v-if="keywordMode=='Simple Mode'" >
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


				<div v-else>
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
				</div>
				{{$t('analyse.keywordInput.keywordCQL')}}: {{ keywordsPatt }}
			</div>
		</div>
	</div>

</template>

<script lang="ts">

// TODO:The code of this vue document is very ugly and should be rewrited,
// and when I rewrite this code, the page shown on the screen should be beautiful.
import Vue from 'vue';

import * as RootStore from '@/store/search/';
import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';
import * as InterfaceStore from '@/store/search/form/interface';
import * as PatternStore from '@/store/search/form/patterns';
import * as CollocationStore from '@/store/search/form/analyse/collocation';
import * as CooccurStore from '@/store/search/form/analyse/cooccur';
import * as FilterStore from '@/store/search/form/filters';

import Annotation from '@/pages/search/form/Annotation.vue';
import SearchAdvanced from '@/pages/search/form/SearchAdvanced.vue';
import SearchExpert from '@/pages/search/form/SearchExpert.vue';
import ConceptSearch from '@/pages/search/form/concept/ConceptSearch.vue';
import GlossSearch from '@/pages/search/form/concept/GlossSearch.vue';
import ParallelSourceAndTargets from '@/pages/search/form/ParallelSourceAndTargets.vue';
import Within from '@/pages/search/form/Within.vue';
import uid from '@/mixins/uid';
import cloneDeep from 'clone-deep';

import { getPatternString, getWithinClausesFromFilters } from '@/utils/pattern-utils';

import { blacklabPaths } from '@/api';
import * as AppTypes from '@/types/apptypes';
import { getAnnotationSubset , uiTypeSupport, getCorrectUiType} from '@/utils';

import SelectPicker, { Option } from '@/components/SelectPicker.vue';
import { corpusCustomizations } from '@/store/search/ui';

function isVue(v: any): v is Vue { return v instanceof Vue; }
function isJQuery(v: any): v is JQuery { return typeof v !== 'boolean' && v && v.jquery; }

export default Vue.extend({
	components: {
		SelectPicker,
		ParallelSourceAndTargets,
		Annotation,
		SearchAdvanced,
		SearchExpert,
		ConceptSearch,
		GlossSearch,
		Within,
	},
	data: () => ({
		subscriptions: [] as Array<() => void>,

		keywordMode: 'Simple Mode',
	}),
	computed: {
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
			return enabled ? elements.filter(element => corpusCustomizations.search.within.includeSpan(element.value)) : [];
		},
		within(): string|null {
			return PatternStore.getState().shared.within;
		},
		simple: {
			get(): AppTypes.AnnotationValue { return PatternStore.getState().simple.annotationValue; },
			set: PatternStore.actions.simple.annotation,
		},
		advanced: {
			get(): string|null { return PatternStore.getState().advanced.query; },
			set: PatternStore.actions.advanced.query,
		},
		concept: {
			get(): string|null { return PatternStore.getState().concept; },
			set: PatternStore.actions.concept,
		},

		customAnnotations() {
			return UIStore.getState().search.shared.customAnnotations;
		},

		// TODO: Now the update of keywordsPatt(also keywords) depends on the "keywordsPatt" in HTML.
		// It should be corrected
		keywordsPatt() {
			const state = PatternStore.getState();
			const defaultAlignBy = UIStore.getState().search.shared.alignBy.defaultValue;
			const alignBy = state.shared.alignBy || defaultAlignBy;
			const targets = state.shared.targets || [];
			const analyseMode = InterfaceStore.getState().analyseMode;
			if (this.keywordMode == 'Simple Mode'){
				const q = state.simple.annotationValue.value ? [state.simple.annotationValue] : [];
				const cql =  q.length ?
					getPatternString(q, {}, targets, alignBy) :
					undefined;
				if (analyseMode == 'collocation') {
					CollocationStore.actions.keywords.value(cql? cql : '');
				} else if (analyseMode == 'cooccur') {
					CooccurStore.actions.keywords.value(cql? cql : '');
				}
				return cql;
			} else if (this.keywordMode == 'Extended Mode'){
				const [withinClauses, withinClausesNoWithinWidget] = getWithinClausesFromFilters(FilterStore.getState().filters, state);
				const r = cloneDeep(Object.values(state.extended.annotationValues))
				.filter(annot => !!annot.value)
				.map(annot => ({
					...annot,
					type: getCorrectUiType(uiTypeSupport.search.extended, annot.type!)
				}));
				const cql =r.length || Object.keys(withinClauses).length > 0 ?
					getPatternString(r, withinClauses, targets, alignBy) :
					undefined;
				if (analyseMode == 'collocation') {
					CollocationStore.actions.keywords.value(cql? cql : '');
				} else if (analyseMode == 'cooccur') {
					CooccurStore.actions.keywords.value(cql? cql : '');
				}
				return cql;
			}

		},

		keywordModeOptions() {
			return [
				'Simple Mode',
				'Extended Mode',
			];
		},

	},
	methods: {
		getTabId(name?: string) {
			return name?.replace(/[^\w]/g, '_') + '_annotations';
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
		},
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

#simple > .form-group {
	margin: auto;
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
