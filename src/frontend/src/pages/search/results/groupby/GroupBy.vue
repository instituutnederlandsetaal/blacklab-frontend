<template>

	<button v-if="!active && !addedCriteria.length" class="btn btn-default btn-secondary btn-sm" type="button" @click="active=true">
		{{$t('results.groupBy.groupResults')}}
	</button>

	<div v-else class="panel panel-primary">
		<div class="panel-heading" style="display: flex; align-items: first baseline; gap: 0.25em;">
			<h3 class="panel-title" style="padding-right: 0.5em;">{{$t('results.groupBy.groupResults')}}</h3>
			<button v-if="type === 'hits'" class="btn btn-default" type="button" @click="addAnnotation">+ {{$t('results.groupBy.annotation')}}</button>
			<button class="btn btn-default" type="button" @click="addMetadata">+ {{$t('results.groupBy.metadata')}}</button>
		</div>

		<Tabs v-if="tabs.length"
			style="margin-top: 6px; padding: 0 0.5em;"
			:tabs="tabs"

			wrap
			:value="selectedCriteriumIndex"
			@input="selectedCriteriumIndex = $event"
			@middlemouse="$event.index < addedCriteria.length && removeGroup($event.index)"
		>
			<template #after="{tab, i}">
				<button
					type="button"
					@click="removeGroup(i)"
					class="btn btn-link remove-group-button"
					style="align-self: flex-start;margin-top: -0.25em;font-size: 150%"
				>
					<strong class="text-danger">&times;</strong>
				</button>
			</template>
		</Tabs>

		<div class="panel-body" v-if="!addedCriteria.length || selectedCriterium">
			<template v-if="selectedCriterium?.type === 'context'">
				<span v-if="isParallel">{{ $t('results.groupBy.parallelCorpusVersion') }}</span>
				<SelectPicker v-if="isParallel"
						:options="parallelVersionOptions"
						v-model="selectedCriterium.fieldName"
						allowUnknownValues
						data-width="auto"
						data-menu-width="auto"
						hideEmpty />
				<i18n path="results.groupBy.iWantToGroupOnAnnotation" tag="div">
					<!-- allow unknown values here. If grouping on a capture group/relation, they're not always available immediately (we need the first hit to decode them). -->
					<template #some_words><SelectPicker
						:options="contextOptions"
						v-model="contextValue"
						allowUnknownValues
						data-width="auto"
						data-menu-width="auto"
						hideEmpty
						allowHtml
					/></template>
					<!-- Specific layout, we want to hide the selectpicker, but there might be surrounding text that also needs to be hidden... -->
					<template #in_this_location_with_text>
						<!-- if not grouping on a label but on a specific position, then show the position picker. -->
						<i18n v-if="selectedCriteriumAsPositional" path="results.groupBy.in_this_location_with_text">
							<template #in_this_location> <!-- doesn't seem to work if we don't wrap the selectpicker in a template. -->
								<SelectPicker
									v-model="positionValue"
									hideEmpty
									data-width="auto"
									data-menu-width="auto"
									:options="positionOptions"
								/>
							</template>
						</i18n>
					</template>
					<template #this_annotation>
					<SelectPicker
						:placeholder="'...' + '\xa0'.repeat(20) /*nbsp*/"
						data-width="auto"
						data-menu-width="auto"
						right
						searchable
						hideEmpty
						:options="annotations"
						allowHtml
						v-model="selectedCriterium.annotation"
					/></template>
				</i18n>


				<form class="case-and-context">
					<div class="labels">
						<label for="group-case-sensitive">{{ $t('results.groupBy.caseSensitive') }}: </label>
						<label v-if="selectedCriterium.context.type === 'label' && relationNames?.includes(selectedCriterium.context.label)" for="group-relation">{{ $t('results.groupBy.relationPartLabel') }}:</label>
					</div>
					<div class="inputs">
						<input id="group-case-sensitive" type="checkbox" v-model="selectedCriterium.caseSensitive">
						<div v-if="selectedCriterium.context.type === 'label' && relationNames?.includes(selectedCriterium.context.label)" class="btn-group">
							<button type="button"
								class="btn btn-default btn-sm"
								:class="{active: selectedCriterium.context.relation === 'target'}"
								@click="selectedCriterium.context.relation = 'target'"
								>{{$t('results.groupBy.relationTarget')}}</button>
							<button type="button"
								class="btn btn-default btn-sm"
								:class="{active: selectedCriterium.context.relation === 'source'}"
								@click="selectedCriterium.context.relation = 'source'"
							>{{$t('results.groupBy.relationSource')}}</button>
							<!-- Never want to group on things in between source and target of a relation apparently. So don't show this button. -->
							<!-- <button type="button"
								class="btn btn-default btn-sm"
								:class="{active: current.context.relation === 'full' || !current.context.relation}"
								@click="current.context.relation = 'full'"
							>{{$t('results.groupBy.relationBoth')}}</button> -->
						</div>
					</div>
				</form>


				<div style="padding: 10px 0 25px;"  v-if="sliderVisible">
					<div v-html="$t('results.groupBy.chooseWordPositions')"></div>
					<Slider
						:direction="sliderInverted ? 'rtl' : 'ltr'"
						inline
						:min="1"
						:max="contextsize"
						:data="sliderLabels"
						v-model="sliderValue"
					/>
				</div>

				<em class="text-muted" v-if="relations.length + captures.length"><span class="fa fa-exclamation-triangle text-primary"></span> {{$t('results.groupBy.tipClickOnHighlightedWords')}} ⤵</em>
			</template>
			<template v-else-if="selectedCriterium?.type === 'metadata'" class="content">
				{{ $t('results.groupBy.selectDocumentMetadata') }}<br>
				<SelectPicker
					:placeholder="$t('results.groupBy.metadata')"
					allowHtml
					hideEmpty
					data-width="auto"
					data-menu-width="auto"
					v-model="selectedCriterium.field"
					:options="metadata"
				/>

				<!-- mimic style of annotation box. -->
				<form class="case-and-context">
					<div class="labels">
						<label for="group-case-sensitive">{{ $t('results.groupBy.caseSensitive') }}: </label>
					</div>
					<div class="inputs">
						<input id="group-case-sensitive" type="checkbox" v-model="selectedCriterium.caseSensitive">
					</div>
				</form>
			</template>
			<template v-else-if="selectedCriterium?.type === 'custom'">
				{{selectedCriterium.value}}
			</template>
			<em v-else class="h5 text-muted">{{ $t('results.groupBy.clickButtonsToStart') }}</em>
		</div>

		<div v-if="selectedCriterium?.type === 'context'" class="hit-preview panel-footer">
			<template v-for="(section, i) of preview">
				<div v-if="i !== 0" class="separator"></div>
				<template v-for="({selectedAnnotation, word, punct, active, style}, j) of section">
					<component
						:is="active ? 'section' : 'div'"
						:key="word + i + '_' + j"
						:class="{
							'word': true,
							'active': active,
							'text-primary': active,
							'bold': i === 1
						}"
						:style="style"
						@click="handlePreviewClick($event, i, j)"
					>
						<div :title="word" class="main">{{ word }}</div>
						<div :title="selectedAnnotation" class="annotation">{{ selectedAnnotation }}</div>
					</component>
					<!-- punctuation between words. -->
					<component :is="active && section[j+1]?.active ? 'section' : 'div'" :class="{punct: true, active: active && section[j+1]?.active}" :title="punct">{{ punct || ' ' }}</component>
				</template>
			</template>
		</div>

		<div class="panel-footer text-right">
			<button type="button" :disabled="disabled" class="btn btn-default" @click="clear">{{addedCriteria.length ? $t('results.groupBy.clear') : $t('results.groupBy.close')}}</button>
			<button type="button" :disabled="disabled || !addedCriteria.length" class="btn btn-primary" @click="apply">{{ $t('results.groupBy.apply') }}</button>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as CorpusStore from '@/store/search/corpus';
import * as UIStore from '@/store/search/ui';
import * as ResultsStore from '@/store/search/results/views';
import * as GlobalSearchSettingsStore from '@/store/search/results/global';
import * as SearchModule from '@/store/search/index';

import { getAnnotationSubset, getMetadataSubset } from '@/utils';
import { blacklab } from '@/api';

import {isHitResults, BLSearchResult, BLSearchParameters, BLHitResults} from '@/types/blacklabtypes';

import {GroupBy, serializeGroupBy, parseGroupBy, isValidGroupBy, ContextPositional, GroupByContext, ContextLabel, humanizeGroupBy as summarizeGroup} from '@/utils/grouping';

import debug from '@/utils/debug';

// @ts-ignore
import Slider from 'vue-slider-component';
import 'vue-slider-component/theme/default.css'
import jsonStableStringify from 'json-stable-stringify';

import SelectPicker, { Options } from '@/components/SelectPicker.vue';
import { getHighlightColors, snippetParts } from '@/utils/hit-highlighting';
import { CaptureAndRelation, HitToken, Option, TokenHighlight } from '@/types/apptypes';


import Tabs from '@/components/Tabs.vue';

export default Vue.extend({
	components: {
		SelectPicker,
		Slider,
		Tabs
	},
	props: {
		type: String, // grouping hits or docs?
		disabled: Boolean,
		results: Object as () => BLSearchResult|undefined
	},
	data: () => ({
		/** The criteria the user has added to group on */
		addedCriteria: [] as GroupBy[],
		/** which of the addedCriteria is currently selected (to be edited on the right side) */
		selectedCriteriumIndex: 0,

		/** micro optimization: whether to skip next parse since the new value came from us anyway. */
		storeValueUpdateIsOurs: false,

		/** For the preview. Results from props can also be grouped, so we need to request these ourselves. */
		hits: undefined as undefined|BLHitResults,

		active: false
	}),
	computed: {
		metadataGroups() { return CorpusStore.get.metadataGroups() },
		metadataFieldsMap() { return CorpusStore.get.allMetadataFieldsMap() },
		annotationGroups() { return CorpusStore.get.annotationGroups() },
		annotationsMap() { return CorpusStore.get.allAnnotationsMap() },

		tabs(): Option[] {
			return this.addedCriteria.map((c, i) => ({
				label: summarizeGroup(this, c, this.annotationsMap, this.metadataFieldsMap),
				value: i.toString(),
				class: isValidGroupBy(c) ? '' : 'text-muted',
			}));
		},
		defaultAnnotation(): string {
			const a = this.annotations.find(a => typeof a === 'object' && 'options' in a) as any;
			return a?.options[0]?.value ?? '';
		},
		storeModule(): ResultsStore.ViewModule { return ResultsStore.getOrCreateModule(this.type); },
		storeValue(): string[] { return this.storeModule.getState().groupBy; },
		firstHitPreviewQuery(): BLSearchParameters|undefined {
			let params = SearchModule.get.blacklabParameters();
			if (!params || !params.patt) return undefined; // can't get hits without a query

			params = {...params}; // make a copy before modifying
			if (!params.viewgroup)
				delete params.group;
			delete params.includetokencount;
			delete params.listvalues;
			params.listmetadatavalues = '__nothing__';
			params.first = 0;
			params.number = 1;
			params.waitfortotal = false;
			return params;
		},
		firstHitPreviewQueryHash(): string {
			return jsonStableStringify(this.firstHitPreviewQuery);
		},

		annotations(): Options {
			return getAnnotationSubset(
				UIStore.getState().results.shared.groupAnnotationIds,
				this.annotationGroups,
				this.annotationsMap,
				'Search',
				this,
				CorpusStore.get.textDirection(),
				debug.debug, // is debug enabled - i.e. show debug labels in dropdown
				UIStore.getState().dropdowns.groupBy.annotationGroupLabelsVisible
			).map(group => ({label: group.label, title: group.title, options: group.options}))
		},
		metadata(): Options {
			const r = getMetadataSubset(
				UIStore.getState().results.shared.groupMetadataIds,
				this.metadataGroups,
				this.metadataFieldsMap,
				'Group',
				this,
				debug.debug, // is debug enabled - i.e. show debug labels in dropdown
				UIStore.getState().dropdowns.groupBy.metadataGroupLabelsVisible
			)
			return r;
		},

		contextsize(): number {
			let params = SearchModule.get.blacklabParameters();
			if (!params || !params.patt) return 5; // default
			return typeof params.context === 'number' ? params.context as number :  // use actual value from query if set
			    (typeof GlobalSearchSettingsStore.getState().context === 'number' ?
			        GlobalSearchSettingsStore.getState().context as number :  // use global default if set
			        5); // use default
		},

		captures(): { name: string, label: string, targetField: string }[] {
			const mi = this.hits?.summary?.pattern?.matchInfos;
			return Object.entries(mi|| {})
				.filter(([k, v]) => v.type === 'span' && (!v.fieldName || v.fieldName === this.selectedCriteriumAsPositional?.fieldName))
				.map(([k,v]) => {
					return {
						name: k,
						label: k,
						targetField: v.fieldName ?? '',
					}
				});
		},
		relations() {
			const mi = this.hits?.summary?.pattern?.matchInfos;
			const result: { name: string, label: string, targetField: string }[] = [];
			Object.entries(mi|| {})
				.filter(([k, v]) => v.type === 'relation')
				.forEach(([k,v]) => {
					if (!v.fieldName || v.fieldName === this.selectedCriteriumAsPositional?.fieldName) {
						result.push({
							label: k,
							name: `${k}@source`,
							targetField: v.fieldName ?? '',
						});
					}
					if (!v.fieldName || v.targetField === this.selectedCriteriumAsPositional?.fieldName) {
						result.push({
							label: k,
							name: `${k}@target`,
							targetField: v.targetField ?? '',
						});
					}
				});
			return result;
		},
		relationNames(): string[] {
			return this.relations.map(c => c.name);
		},

		mainSearchField(): string {
			return this.results?.summary.pattern?.fieldName ?? '';
		},

		colors(): Record<string, TokenHighlight> {
			return this.hits ? getHighlightColors(this.hits.summary) : {};
		},

		selectedCriterium(): GroupBy|undefined { return this.addedCriteria[this.selectedCriteriumIndex]; },
		// Some utils to cast the current group to a specific type.
		// so we can use it in computeds for the template.
		/** When grouping on either: capture group, or relation source/target. */
		selectedCriteriumAsLabel(): undefined|GroupByContext<ContextLabel> {
			if (this.selectedCriterium?.type === 'context' && this.selectedCriterium.context.type === 'label')
				return this.selectedCriterium as GroupByContext<ContextLabel>;
		},
		selectedCriteriumAsPositional(): undefined|GroupByContext<ContextPositional> {
			if (this.selectedCriterium?.type === 'context' && this.selectedCriterium.context.type === 'positional')
				return this.selectedCriterium as GroupByContext<ContextPositional>;
		},
		selectedCriteriumAsSlider(): undefined|GroupByContext<ContextPositional> {
			if (this.selectedCriteriumAsPositional?.context.whichTokens === 'specific')
				return this.selectedCriteriumAsPositional;
		},

		sliderVisible(): boolean { return !!this.selectedCriteriumAsSlider; },
		sliderInverted(): boolean { const p = this.selectedCriteriumAsSlider?.context.position; return p === 'E' || p === 'B'; },
		sliderLabels(): any[] { return Array.from({length: this.contextsize}, (_, i) => i + 1).map(i => ({value: i, label: i})); },
		sliderValue: {
			get(): [number, number] { return [this.selectedCriteriumAsSlider?.context.start ?? 1, this.selectedCriteriumAsSlider?.context.end ?? 1]; },
			set(v: [number, number]) {
				if (this.selectedCriteriumAsSlider) {
					this.selectedCriteriumAsSlider.context.start = v[0];
					this.selectedCriteriumAsSlider.context.end = v[1];
				}
			}
		},

		preview(): {
			active: boolean;
			word: string;
			selectedAnnotation: string;
			punct: string;
			style: object;
			captureAndRelation: CaptureAndRelation[]|undefined;
		}[][] {
			if (this.selectedCriterium?.type !== 'context' || !isHitResults(this.hits) || !this.hits.hits.length) return [];

			const wordAnnotation = UIStore.getState().results.shared.concordanceAnnotationId;
			const firstHit = this.hits.hits[0];
			const targetField = this.selectedCriteriumAsPositional?.fieldName;
			const hitInField = targetField && targetField.length > 0 && targetField !== this.mainSearchField && firstHit.otherFields ? firstHit.otherFields[targetField] : firstHit;
			const {annotation, context} = this.selectedCriterium;

			const snippet = snippetParts(hitInField, wordAnnotation, CorpusStore.get.textDirection(), this.colors)
			const position = context.type === 'positional' ? context.position : undefined;

			// Now extract the indices of the tokens that are active (i.e. being grouped on).
			// start and end here are INCLUSIVE and 0-indexed. While start + end in the GroupBy object are 1-indexed.
			// If we're not grouping on a specific word, we'll just show the entire snippet without anything highlighted.
			let start =  Number.MAX_SAFE_INTEGER;
			let end = -Number.MAX_SAFE_INTEGER;
			if (context.type === 'positional') {
				const whichTokens = context.whichTokens;
				if (whichTokens === 'all') { start = 0; end = Number.MAX_SAFE_INTEGER; }
				else if (whichTokens === 'first') { start = 0; end = 0; }
				else { start = context.start! - 1; end = context.end! - 1; }

				// left/before context ('B') and hit-from-end context ('E') use inverted index in BlackLab, mimic this.
				if (position === 'E' || position === 'B') {
					const sectionLength = position === 'E' ? snippet.match.length : snippet.before.length;
					// subtract 1 because array.length is 1 more than the last index.
					const tmp = start;
					start = sectionLength - end - 1;
					end = sectionLength - tmp - 1;
				}
			}

			const isActiveIndex = (i: number): boolean => i >= start && i <= end;

			const isActiveRelationOrCapture = (t: HitToken): boolean => {
				/** might be null if not grouping on a capture at the moment */
				const currentlyGroupedOnCaptureOrRelation =  t.captureAndRelation?.find(c => c.key === this.selectedCriteriumAsLabel?.context.label);
				if (!currentlyGroupedOnCaptureOrRelation) return false;

				if (this.selectedCriteriumAsLabel?.context.relation === 'source') { return currentlyGroupedOnCaptureOrRelation.isSource; }
				else if (this.selectedCriteriumAsLabel?.context.relation === 'target') { return currentlyGroupedOnCaptureOrRelation.isTarget; }
				else return true;
			}

			const getPreviewStyle = (t: HitToken): object => {
				return t.captureAndRelation?.length ? {
					background: `linear-gradient(90deg, ${t.captureAndRelation.map((c, i) => `${c.highlight.color} ${i / t.captureAndRelation!.length * 100}%, ${c.highlight.color} ${(i + 1) / t.captureAndRelation!.length * 100}%`)})`,
					color: t.captureAndRelation[0].highlight.textcolor,
					textShadow: `0 0 1.25px ${t.captureAndRelation[0].highlight.textcolorcontrast},`.repeat(10).replace(/,$/, ''),
					cursor: 'pointer',
				} : {}
			}

			return [
				snippet.before.map((t, i) => ({
					word: t.annotations[wordAnnotation] || '·',
					selectedAnnotation: t.annotations[annotation!] || '·',
					punct: t.punct,
					active: (position === 'B' && isActiveIndex(i)) || isActiveRelationOrCapture(t),
					style: getPreviewStyle(t),
					captureAndRelation: t.captureAndRelation,
				})),
				snippet.match.map((t, i) => ({
					word: t.annotations[wordAnnotation] || '·',
					selectedAnnotation: t.annotations[annotation!] || '·',
					punct: t.punct,
					active: ((position === 'H' || position === 'E') && isActiveIndex(i)) || isActiveRelationOrCapture(t),
					style: getPreviewStyle(t),
					captureAndRelation: t.captureAndRelation,
				})),
				snippet.after.map((t, i) => ({
					word: t.annotations[wordAnnotation] || '·',
					selectedAnnotation: t.annotations[annotation!] || '·',
					punct: t.punct,
					active: (position === 'A' && isActiveIndex(i)) || isActiveRelationOrCapture(t),
					style: getPreviewStyle(t),
					captureAndRelation: t.captureAndRelation,
				}))
			];
		},

		contextOptions(): Options {
			return [{
				label: this.$t('results.groupBy.some_words.theFirstWord').toString(),
				value: 'first'
			}, {
				label: this.$t('results.groupBy.some_words.allWords').toString(),
				value: 'all'
			}, {
				label: this.$t('results.groupBy.some_words.specificWords').toString(),
				value: 'specific'
			}, {
				label: this.$t('results.groupBy.some_words.captureGroupsLabel').toString(),
				options: [
					...this.relations.map(c => ({
						label: `<span class="color-ball" style="background-color: ${this.colors[c.label].color};">&nbsp;</span> relation ${c.name}`,
						value: c.name
					})),
					...this.captures.map(c => ({
						label: `<span class="color-ball" style="background-color: ${this.colors[c.label].color};">&nbsp;</span> capture ${c.name}`,
						value: c.name
					}))
				]
			}];
		},
		contextValue: {
			/** The string value is when grouping on a capture group or relation. */
			get(): 'first'|'all'|'context'|string {
				// if grouping on a label: return the label, if grouping on a position: return the position.
				// Otherwise blank.
				return this.selectedCriteriumAsLabel?.context.label ?? this.selectedCriteriumAsPositional?.context.whichTokens ?? '';
			},
			/** The string value is when grouping on a capture group or relation. */
			set(v: 'first'|'all'|'specific'|string) {
				if (this.selectedCriterium?.type !== 'context') return;

				// should never happen we receive one of these options when type is not 'positional'
				// but make typescript happy.
				if (v === 'first' || v === 'all' || v === 'specific') {
					if (this.selectedCriteriumAsPositional) {
						this.selectedCriteriumAsPositional.context.whichTokens = v;
					} else {
						// update context object as we're currently grouping on a label.
						this.selectedCriterium.context = {
							type: 'positional',
							position: 'H',
							whichTokens: v,
							start: 1,
							end: this.contextsize,
						}
					}
					// if we're grouping on the entire hit, we can't group from the end. (blacklab limitation)
					if (v === 'all' && this.selectedCriteriumAsPositional?.context.position === 'E') {
						this.selectedCriteriumAsPositional.context.position = 'H';
					}
				} else {
					this.selectedCriterium.context = {
						type: 'label',
						label: v,
						relation: this.relationNames?.includes(v) ? 'target' : undefined
					}
				}
			},
		},

		positionOptions(): Options {
			if (!(this.selectedCriterium?.type === 'context' && this.selectedCriterium.context.type === 'positional')) return [];

			return [
			{ label: this.$t('results.groupBy.in_this_location.beforeTheHit').toString(), value: 'B'},
			{ label: this.$t('results.groupBy.in_this_location.inTheHit').toString(), value: 'H' },
			// grouping from the end of the hit when grouping on entire hit is not possible (causes an exception in BlackLab)
			...(this.selectedCriterium?.context.whichTokens !== 'all' ? [{label: this.$t('results.groupBy.in_this_location.fromTheEnd').toString(), value: 'E'}] : []),
			{ label: this.$t('results.groupBy.in_this_location.afterTheHit').toString(), value: 'A' }];
		},
		positionValue: {
			get(): 'B'|'H'|'E'|'A' { return this.selectedCriterium?.type === 'context' && this.selectedCriterium.context.type === 'positional' ? this.selectedCriterium.context.position : 'H'; },
			set(v: 'B'|'H'|'E'|'A') {
				if (this.selectedCriterium?.type === 'context' && this.selectedCriterium.context.type === 'positional')
					this.selectedCriterium.context.position = v ;
			}
		},


		isParallel(): boolean { return CorpusStore.get.isParallelCorpus() ?? false; },

		parallelVersionOptions(): Option[] {
			// First gather all parallel fields involved in the current search.
			/** The complete names of the (parallel) fields involved in the query names, e.g. ["contents__en", "contents__nl"] */
			const fieldNames: string[] = [];
			fieldNames.push(this.mainSearchField);
			if (this.hits?.summary.pattern?.otherFields)
				fieldNames.push(...this.hits.summary.pattern.otherFields);

			// Now we have the full field names, map them to their localized display names.
			// For this we need the underlying field objects from the corpus.
			const fields = CorpusStore.get.allAnnotatedFieldsMap();
			return fieldNames.map(name => fields[name]).map<Option>(field => ({
				value: field.id,
				label: this.$tAnnotatedFieldDisplayName(field)
			}))
		}
	},
	methods: {
		apply() {
			this.storeValueUpdateIsOurs = true;
			this.storeModule.actions.groupBy(serializeGroupBy(this.addedCriteria.filter(isValidGroupBy)));
			this.selectedCriteriumIndex = -1;
		},

		isEmptyGroup(group: GroupBy) { return (group.type === 'context' && !group.annotation) || (group.type === 'metadata' && !group.field); },
		isInvalidGroup(group: GroupBy) { return !this.isEmptyGroup(group) && !isValidGroupBy(group); },
		removeGroup(i: number) {
			if (this.selectedCriteriumIndex >= i) this.selectedCriteriumIndex--;
			this.addedCriteria.splice(i, 1);
		},
		clear() {
			this.addedCriteria = [];
			this.selectedCriteriumIndex = -1;
			this.active = false;
			this.apply();
		},
		addAnnotation() {
			this.addedCriteria.push({
				type: 'context',
				fieldName: this.mainSearchField ?? '',
				annotation: this.defaultAnnotation,
				context: {
					type: 'positional',
					position: 'H',
					whichTokens: 'all',
					start: 1,
					end: this.contextsize
				},
				caseSensitive: false
			});
			this.selectedCriteriumIndex = this.addedCriteria.length -1;
		},
		addMetadata() {
			this.addedCriteria.push({
				type: 'metadata',
				field: '',
				caseSensitive: false
			});
			this.selectedCriteriumIndex = this.addedCriteria.length -1;
		},
		/**
		 * When a highlighted word in the preview is clicked, retrieve what it represents (a capture group, or relation source/target)
		 * And update the current grouping criterium to be that.
		 *
		 * When a word has multiple things it represents, use the position of the click to determine which one was clicked.
		 * When a relation is clicked and it's already the current relation, toggle between source/target and full context.
		 */
		handlePreviewClick(event: MouseEvent, section: number, index: number) {
			const preview = this.preview[section][index];
			if (!preview.captureAndRelation?.length || this.selectedCriterium?.type !== 'context') return;

			const elementRect = (event.target as HTMLElement).getBoundingClientRect();
			const elementLeftBorder = elementRect.left + window.scrollX;
			const clickPositionInElement = event.pageX - elementLeftBorder;
			const elementWidth = elementRect.width;

			// sometimes a click slightly outside the element can cause a negative or overflow value, so clamp it.
			const relationIndex = Math.max(0, Math.min(Math.floor((clickPositionInElement / elementWidth) * preview.captureAndRelation.length), preview.captureAndRelation.length - 1));
			const relation = preview.captureAndRelation[relationIndex];

			this.selectedCriterium.context = {
				type: 'label',
				label: relation.key,
				relation: relation.isSource ? 'source' : relation.isTarget ? 'target' : undefined,
			}
		},
	},
	watch: {
		storeValue: {
			immediate: true,
			handler() {
				if (this.storeValueUpdateIsOurs) {
					this.storeValueUpdateIsOurs = false;
					return;
				}
				this.addedCriteria = parseGroupBy(this.storeValue);
				this.active = this.active || this.addedCriteria.length > 0;
				if (this.selectedCriteriumIndex >= this.addedCriteria.length) {
					this.selectedCriteriumIndex = this.addedCriteria.length - 1;
				}
			},
		},
		// Watch the hash since the query params object itself can update even if it's the same (such as when paginating)
		firstHitPreviewQueryHash: {
			immediate: true,
			handler() {
				this.hits = undefined;
				if (this.firstHitPreviewQuery) {
					blacklab.getHits(INDEX_ID, this.firstHitPreviewQuery).request.then(r => this.hits = r as BLHitResults);
				}
			}
		},
	},
});
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
	>.inputs {
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
		&:not(.active) { border-radius: 6px; }
	}

	/** In between words. Is separate from the word container because in the past words could be shrunk, but punctuation was exempt from that. */
	.punct {
		flex: none;
		white-space: pre;
	}

	.word > .main {
		white-space: pre;
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
		flex: none;
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
