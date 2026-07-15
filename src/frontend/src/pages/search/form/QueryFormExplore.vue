<template>
	<div>
		<h3>{{ $t('explore.heading') }}</h3>
		<ul class="nav nav-tabs">
			<li :class="{ active: exploreMode === 'corpora' }" @click.prevent="exploreMode = 'corpora'">
				<a href="#explore-corpora">{{ $t('explore.corpora.heading') }}</a>
			</li>
			<li :class="{ active: exploreMode === 'ngram' }" @click.prevent="exploreMode = 'ngram'">
				<a href="#explore-n-grams">{{ $t('explore.ngram.heading') }}</a>
			</li>
			<li :class="{ active: exploreMode === 'frequency' }" @click.prevent="exploreMode = 'frequency'">
				<a href="#explore-frequency">{{ $t('explore.frequency.heading') }}</a>
			</li>
		</ul>

		<div class="tab-content">
			<div id="explore-corpora" :class="['tab-pane', { active: exploreMode === 'corpora' }]">
				<FormSystem v-if="renderNewForm('corpora')" :runtime="checkedSearchFormRuntime" :root-id="newExploreFormId('corpora')" @submit="submitNewForm" @reset="resetNewForm" />
				<div v-else class="form-horizontal'">
					<div class="form-group">
						<label class="col-xs-4 col-md-2" for="corpora-group-by">{{ $t('explore.corpora.groupBy') }}</label>
						<div class="col-xs-8">
							<SelectPicker
								:placeholder="`${$t('explore.corpora.groupBy')}...`"
								data-id="corpora-group-by"
								data-width="100%"
								style="max-width: 400px"
								hideEmpty
								allowHtml
								:options="metadataGroupByOptions"
								v-model="corporaGroupBy"
							/>
						</div>
					</div>
					<div class="form-group">
						<label class="col-xs-4 col-md-2" for="corpora-display-mode">{{ $t('explore.corpora.showAs.heading') }}</label>
						<div class="col-xs-8">
							<SelectPicker
								:placeholder="$t('explore.corpora.showAs.heading')"
								data-id="corpora-display-mode"
								data-width="100%"
								style="max-width: 400px"
								hideEmpty
								allowHtml
								:options="corporaGroupDisplayModeOptions"
								v-model="corporaGroupDisplayMode"
							/>
						</div>
					</div>
				</div>
			</div>
			<div id="explore-n-grams" :class="['tab-pane', { active: exploreMode === 'ngram' }]">
				<FormSystem v-if="renderNewForm('ngram')" :runtime="checkedSearchFormRuntime" :root-id="newExploreFormId('ngram')" @submit="submitNewForm" @reset="resetNewForm" />
				<div v-else class="form-horizontal">
					<div class="form-group" v-if="isParallelCorpus">
						<label class="col-xs-4 col-md-2" for="corpora-group-by">{{ $t('search.parallel.searchSourceVersion') }}</label>
						<div class="col-xs-8">
							<ParallelSource block lg :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />
						</div>
					</div>
					<div class="form-group">
						<label class="col-xs-4 col-md-2" for="n-gram-size">{{ $t('explore.ngram.ngramSize') }}</label>
						<div class="col-xs-8 col-md-5">
							<input class="form-control" name="n-gram-size" id="n-gram-size" type="number" min="1" :max="ngramSizeMax" v-model.number="ngramSize" />
						</div>
					</div>
					<div class="form-group">
						<label class="col-xs-4 col-md-2" for="n-gram-type">{{ $t('explore.ngram.ngramType') }}</label>

						<div class="col-xs-8 col-md-5">
							<SelectPicker data-name="n-gram-type" data-id="n-gram-type" data-width="100%" hideEmpty allowHtml :options="annotationGroupByOptions" v-model="ngramType" />
						</div>
					</div>

					<div class="n-gram-container">
						<div v-for="(token, index) in ngramTokens" :key="index" class="n-gram-token">
							<SelectPicker
								data-width="100%"
								data-menu-width="grow"
								:options="annotationSearchOptions"
								:disabled="index >= ngramSize"
								:modelValue="token.id"
								placeholder="Property"
								hideEmpty
								allowHtml
								@change="updateTokenAnnotation(index, $event /* custom component - custom event values */)"
							/>
							<input v-if="!token.annotation" type="text" disabled title="Please select an annotation to edit." class="form-control" :value="token.value" />
							<SelectPicker
								v-else-if="token.annotation.uiType === 'select' || (token.annotation.uiType === 'pos' && token.annotation.values)"
								data-width="100%"
								data-class="btn btn-default"
								data-menu-width="grow"
								:placeholder="$tAnnotDisplayName(token.annotation)"
								:data-dir="token.annotation.isMainAnnotation ? mainTokenTextDirection : undefined"
								:options="token.annotation.values"
								:disabled="index >= ngramSize"
								:modelValue="token.value"
								@change="updateTokenValue(index, $event)"
							/>
							<Lexicon
								v-else-if="token.annotation.uiType === 'lexicon'"
								:annotationId="token.annotation.id"
								:definition="token.annotation"
								:modelValue="token.value"
								@update:modelValue="updateTokenValue(index, $event)"
								ref="reset"
							/>

							<Autocomplete
								v-else
								useQuoteAsWordBoundary
								:placeholder="$tAnnotDisplayName(token.annotation)"
								:dir="token.annotation.isMainAnnotation ? mainTokenTextDirection : undefined"
								:disabled="index >= ngramSize"
								:getData="term => autocomplete(token.annotation, term)"
								:value="token.value"
								@change="updateTokenValue(index, $event)"
							/>
						</div>
					</div>
				</div>
			</div>
			<div id="explore-frequency" :class="['tab-pane', { active: exploreMode === 'frequency' }]">
				<FormSystem v-if="renderNewForm('frequency')" :runtime="checkedSearchFormRuntime" :root-id="newExploreFormId('frequency')" @submit="submitNewForm" @reset="resetNewForm" />
				<div v-else class="form-horizontal">
					<div v-if="isParallelCorpus" class="form-group form-group-lg" style="margin: 0">
						<label class="control-label">{{ $t('search.parallel.searchSourceVersion') }}</label>
						<ParallelSource block lg :errorNoParallelSourceVersion="errorNoParallelSourceVersion" />
					</div>
					<div class="form-group form-group-lg" style="margin: 0">
						<label for="frequency-type" class="control-label">{{ $t('explore.frequency.frequencyType') }}</label>
						<SelectPicker data-id="frequency-type" data-name="frequency-type" data-width="100%" hideEmpty allowHtml :options="annotationGroupByOptions" v-model="frequencyType" />
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import { stripIndent } from 'common-tags';
import { defineComponent, watch } from 'vue';

import { selectedSubcorpusLoader } from '@/api/async/instances/result-count';
import * as RootStore from '@/app/state/root-store';
import * as UIStore from '@/app/state/ui-state';
import { FormSystem, type CompiledFormStateWithSummaries, type FormRuntime } from '@/features/form';
import * as ExploreStore from '@/features/search/model/form/explore-state';
import * as InterfaceStore from '@/features/search/model/form/interface-state';
import * as GlobalViewSettings from '@/features/search/model/results/global-results-state';
import { getNewExploreFormId, useSearchFormSystem } from '@/features/search/model/search-form-builder';
import type { NormalizedAnnotation } from '@/types/apptypes';
import { corpusCustomizations } from '@/utils/customization';

import ParallelFields from './parallel/ParallelFields';

import { useBlackLabApi } from '@/shared/api';
import { getAnnotationSubset, getMetadataSubset } from '@/shared/blacklab-helpers/field-groups';
import debug from '@/shared/debug/debug';
import type { OptGroup, Option } from '@/shared/utils/options';

import Lexicon from '@/pages/search/form/Lexicon.vue';
import ParallelSource from '@/pages/search/form/ParallelSource.vue';
import Autocomplete from '@/shared/ui/Autocomplete.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

export default defineComponent({
	extends: ParallelFields,
	components: {
		FormSystem,
		ParallelSource,
		SelectPicker,
		Autocomplete,
		Lexicon,
	},
	props: {
		errorNoParallelSourceVersion: { default: false, type: Boolean },
	},
	data: () => ({
		debug,
		subcorpus: selectedSubcorpusLoader,
		subscriptions: [] as Array<() => void>,
		blacklab: useBlackLabApi(),
		searchFormRuntime: useSearchFormSystem(),
	}),
	computed: {
		checkedSearchFormRuntime(): FormRuntime {
			if (!this.searchFormRuntime) throw new Error('New search form runtime is not available.');
			return this.searchFormRuntime;
		},
		exploreMode: {
			get(): string {
				return InterfaceStore.getState().exploreMode;
			},
			set: InterfaceStore.actions.exploreMode,
		},

		ngramSize: {
			get: ExploreStore.get.ngram.size,
			set: ExploreStore.actions.ngram.size,
		},

		ngramType: {
			get: ExploreStore.get.ngram.groupAnnotationId,
			set: ExploreStore.actions.ngram.groupAnnotationId,
		},

		ngramTokens() {
			const allAnnotations = this.corpus.allAnnotationsMap;
			return ExploreStore.get.ngram.tokens().map(tok => ({
				...tok,
				annotation: allAnnotations[tok.id],
			}));
		},
		ngramSizeMax: ExploreStore.get.ngram.maxSize,

		frequencyType: {
			get: ExploreStore.get.frequency.annotationId,
			set: ExploreStore.actions.frequency.annotationId,
		},

		corporaGroupBy: {
			get: ExploreStore.get.corpora.groupBy,
			set: ExploreStore.actions.corpora.groupBy,
		},
		corporaGroupDisplayMode: {
			get: ExploreStore.get.corpora.groupDisplayMode,
			set: ExploreStore.actions.corpora.groupDisplayMode,
		},

		annotationSearchOptions(): Option[] | OptGroup[] {
			const optGroups = getAnnotationSubset(UIStore.getState().explore.searchAnnotationIds, this.corpus.annotationGroups, this.corpus.allAnnotationsMap, 'Search', this, debug.value, false);
			return optGroups.length > 1 ? optGroups : optGroups.flatMap(g => g.options as Option[]);
		},
		annotationGroupByOptions(): Option[] | OptGroup[] {
			const optGroups = getAnnotationSubset(
				UIStore.getState().results.shared.groupAnnotationIds,
				this.corpus.annotationGroups,
				this.corpus.allAnnotationsMap,
				'Search', // we don't want the before hit/after hit context options, just do search mode, it'll be fine
				this,
				debug.value,
				UIStore.getState().dropdowns.groupBy.annotationGroupLabelsVisible,
			);
			return optGroups.length > 1 ? optGroups : optGroups.flatMap(g => g.options as Option[]);
		},
		metadataGroupByOptions(): OptGroup[] {
			// we removed the field:prefix from metadata grouping options
			// since the new groupby window. so we need to fix this here
			function fix(o: OptGroup | Option) {
				if ('value' in o) {
					o.value = 'field:' + o.value;
				} else
					o.options.forEach(opt => {
						if (!(typeof opt === 'string')) fix(opt);
					});
			}

			const optGroups = getMetadataSubset(
				UIStore.getState().results.shared.groupMetadataIds,
				this.corpus.metadataGroups,
				this.corpus.allMetadataFieldsMap,
				'Group',
				this,
				debug.value,
				UIStore.getState().dropdowns.groupBy.metadataGroupLabelsVisible,
				corpusCustomizations.search.metadata.showField,
			);
			optGroups.forEach(fix);
			return optGroups;
		},
		corporaGroupDisplayModeOptions(): Option[] {
			// TODO
			return [
				{
					value: 'table',
					label: this.$t('explore.corpora.showAs.table').toString(),
				},
				{
					value: 'docs',
					label: this.$t('explore.corpora.showAs.docs').toString(),
				},
				{
					value: 'tokens',
					label: this.$t('explore.corpora.showAs.tokens').toString(),
				},
			];
		},

		mainTokenTextDirection() {
			return this.corpus.textDirection;
		},
	},
	methods: {
		newExploreFormId(exploreMode: keyof ExploreStore.ModuleRootState): string {
			return getNewExploreFormId(exploreMode);
		},
		renderNewForm(exploreMode: keyof ExploreStore.ModuleRootState): boolean {
			const isEnabled = GlobalViewSettings.getState().useNewSearchForm;
			return isEnabled && this.searchFormRuntime?.definition.getForm(getNewExploreFormId(exploreMode)) != null;
		},
		confirmLargeExploreSearch(): boolean {
			if (!this.subcorpus.isLoaded() || this.subcorpus.value.tokensInMatchingDocuments <= 5000000) return true;
			const msg = stripIndent`
				You have selected a subcorpus of over ${(5000000).toLocaleString()} tokens.
				Please note that this query, on first execution, may take a considerable amount of time to complete.
				Proceed with caution.

				Continue?`;

			return confirm(msg);
		},
		submitNewForm(snapshot: CompiledFormStateWithSummaries) {
			if (!this.confirmLargeExploreSearch()) return;
			RootStore.actions.searchFromSubmit(snapshot);
		},
		resetNewForm() {
			RootStore.actions.reset();
		},
		updateTokenAnnotation(index: number, id: string) {
			ExploreStore.actions.ngram.token({
				index,
				token: { id },
			});
		},
		updateTokenValue(index: number, value: string) {
			ExploreStore.actions.ngram.token({
				index,
				token: { value },
			});
		},
		autocomplete(annot: NormalizedAnnotation, term: string) {
			return this.blacklab.getTermAutocomplete(this.corpus.id!, annot.annotatedFieldId, annot.id, term);
		},
	},
	created() {
		this.corporaGroupDisplayMode = this.corporaGroupDisplayModeOptions[0].value;

		this.subscriptions.push(
			watch(ExploreStore.resetSignal, () => {
				if (this.$refs.reset) {
					(this.$refs.reset as any[]).forEach(v => v.reset());
				}
			}),
		);
	},
	beforeUnmount() {
		this.subscriptions.forEach(unsub => unsub());
		this.subscriptions = [];
	},
});
</script>

<style lang="scss">
.n-gram-container {
	display: flex;
	flex-direction: row;
	flex-wrap: nowrap;
}

.n-gram-token {
	flex-grow: 1;
	width: 0;

	& + & {
		margin-left: 15px;
	}

	> .form-control,
	> .lexicon,
	> .combobox {
		margin-top: 8px;
	}
}
</style>
