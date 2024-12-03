<template>
	<div>
		<h3>{{$t('explore.heading')}}</h3>
		<ul class="nav nav-tabs">
			<li :class="{'active': exploreMode==='corpora'}"   @click.prevent="exploreMode='corpora'"><a href="#explore-corpora">{{$t('explore.corpora.heading')}}</a></li>
			<li :class="{'active': exploreMode==='ngram'}"     @click.prevent="exploreMode='ngram'"><a href="#explore-n-grams">{{$t('explore.ngram.heading')}}</a></li>
			<li :class="{'active': exploreMode==='frequency'}" @click.prevent="exploreMode='frequency'"><a href="#explore-frequency">{{$t('explore.frequency.heading')}}</a></li>
		</ul>

		<div class="tab-content">
			<div id="explore-corpora" :class="['tab-pane form-horizontal', {'active': exploreMode==='corpora'}]">
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="corpora-group-by">{{$t('explore.corpora.groupBy')}}</label>
					<div class="col-xs-8">
						<SelectPicker
							:placeholder="`${$t('explore.corpora.groupBy')}...`"
							data-id="corpora-group-by"
							data-width="100%"
							style="max-width: 400px;"

							searchable
							hideEmpty
							allowHtml

							:options="metadataGroupByOptions"
							v-model="corporaGroupBy"
						/>
					</div>
				</div>
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="corpora-display-mode">{{$t('explore.corpora.showAs.heading')}}</label>
					<div class="col-xs-8">
						<SelectPicker
							:placeholder="$t('explore.corpora.showAs.heading')"
							data-id="corpora-display-mode"
							data-width="100%"
							style="max-width: 400px;"

							hideEmpty
							allowHtml

							:options="corporaGroupDisplayModeOptions"
							v-model="corporaGroupDisplayMode"
						/>
					</div>
				</div>
			</div>
			<div id="explore-n-grams" :class="['tab-pane form-horizontal', {'active': exploreMode==='ngram'}]">
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="n-gram-size">{{$t('explore.ngram.ngramSize')}}</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="n-gram-size"
							id="n-gram-size"

							type="number"
							min="1"
							:max="ngramSizeMax"

							v-model.number="ngramSize"
						/>
					</div>
				</div>
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="n-gram-type">{{$t('explore.ngram.ngramType')}}</label>

					<div class="col-xs-8 col-md-5">
						<SelectPicker
							data-name="n-gram-type"
							data-id="n-gram-type"

							data-width="100%"
							hideEmpty
							allowHtml

							:options="annotationGroupByOptions"

							v-model="ngramType"
						/>
					</div>
				</div>

				<div class="n-gram-container">
					<div v-for="(token, index) in ngramTokens" :key="index" class="n-gram-token">
						<SelectPicker
							data-width="100%"
							data-menu-width="grow"

							:options="annotationSearchOptions"
							:disabled="index >= ngramSize"
							:value="token.id"
							placeholder="Property"
							hideEmpty
							allowHtml

							@change="updateTokenAnnotation(index, $event /* custom component - custom event values */)"
						/>
						<input v-if="!token.annotation" type="text" disabled title="Please select an annotation to edit." class="form-control" :value="token.value">
						<SelectPicker v-else-if="token.annotation.uiType === 'select' || (token.annotation.uiType === 'pos' && token.annotation.values)"
							data-width="100%"
							data-class="btn btn-default"
							data-menu-width="grow"

							:searchable="token.annotation.values && token.annotation.values.length > 12"
							:placeholder="$tAnnotDisplayName(token.annotation)"
							:data-dir="token.annotation.isMainAnnotation ? mainTokenTextDirection : undefined"
							:options="token.annotation.values"
							:disabled="index >= ngramSize"

							:value="token.value"
							@change="updateTokenValue(index, $event)"
						/>
						<Lexicon v-else-if="token.annotation.uiType === 'lexicon'"
							:annotationId="token.annotation.id"
							:definition="token.annotation"

							:value="token.value"
							@input="updateTokenValue(index, $event)"
						/>

						<Autocomplete v-else
							type="text"
							class="form-control"

							useQuoteAsWordBoundary

							:placeholder="$tAnnotDisplayName(token.annotation)"
							:dir="token.annotation.isMainAnnotation ? mainTokenTextDirection : undefined"
							:disabled="index >= ngramSize"

							:autocomplete="token.annotation.uiType === 'combobox'"
							:url="autocompleteUrl(token.annotation)"

							:value="token.value"
							@change="updateTokenValue(index, $event)"
						/>
					</div>
				</div>
			</div>
			<div id="explore-frequency" :class="['tab-pane form-horizontal', {'active': exploreMode==='frequency'}]">
				<div class="form-group form-group-lg" style="margin: 0;">
					<label for="frequency-type" class="control-label">{{$t('explore.frequency.frequencyType')}}</label>
					<SelectPicker
						data-id="frequency-type"
						data-name="frequency-type"

						data-width="100%"
						hideEmpty
						allowHtml

						:options="annotationGroupByOptions"

						v-model="frequencyType"
					/>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as CorpusStore from '@/store/search/corpus';
import * as InterfaceStore from '@/store/search/form/interface';
import * as ExploreStore from '@/store/search/form/explore';
import * as UIStore from '@/store/search/ui';

import SelectPicker, {Option, OptGroup} from '@/components/SelectPicker.vue';
import Autocomplete from '@/components/Autocomplete.vue';
import Lexicon from '@/pages/search/form/Lexicon.vue';
import { getAnnotationSubset, getMetadataSubset } from '@/utils';
import { blacklabPaths } from '@/api';

import debug from '@/utils/debug';

export default Vue.extend({
	components: {
		SelectPicker,
		Autocomplete,
		Lexicon
	},
	data: () => ({
		debug
	}),
	computed: {
		exploreMode: {
			get(): string { return InterfaceStore.getState().exploreMode; },
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
			const allAnnotations = CorpusStore.get.allAnnotationsMap();
			return ExploreStore.get.ngram.tokens().map(tok => ({
				...tok,
				annotation: allAnnotations[tok.id]
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

		annotationSearchOptions(): Option[]|OptGroup[] {
			const optGroups = getAnnotationSubset(
				UIStore.getState().explore.searchAnnotationIds,
				CorpusStore.get.annotationGroups(),
				CorpusStore.get.allAnnotationsMap(),
				'Search',
				this,
				CorpusStore.get.textDirection(),
				debug.debug,
				false
			);
			return optGroups.length > 1 ? optGroups : optGroups.flatMap(g => g.options as Option[]);
		},
		annotationGroupByOptions(): Option[]|OptGroup[] {
			const optGroups = getAnnotationSubset(
				UIStore.getState().results.shared.groupAnnotationIds,
				CorpusStore.get.annotationGroups(),
				CorpusStore.get.allAnnotationsMap(),
				'Search', // we don't want the before hit/after hit context options, just do search mode, it'll be fine
				this,
				CorpusStore.get.textDirection(),
				debug.debug,
				UIStore.getState().dropdowns.groupBy.annotationGroupLabelsVisible
			);
			return optGroups.length > 1 ? optGroups : optGroups.flatMap(g => g.options as Option[]);
		},
		metadataGroupByOptions(): OptGroup[] {
			// we removed the field:prefix from metadata grouping options
			// since the new groupby window. so we need to fix this here
			function fix(o: OptGroup|Option) {
				if ('value' in o) {o.value = 'field:'+o.value;}
				else o.options.forEach(opt => {if (!(typeof opt === 'string')) fix(opt);});
			}

			const optGroups = getMetadataSubset(
				UIStore.getState().results.shared.groupMetadataIds,
				CorpusStore.get.metadataGroups(),
				CorpusStore.get.allMetadataFieldsMap(),
				'Group',
				this,
				debug.debug,
				UIStore.getState().dropdowns.groupBy.metadataGroupLabelsVisible
			);
			optGroups.forEach(fix);
			return optGroups;
		},
		corporaGroupDisplayModeOptions(): Option[] {
			// TODO
			return [{
				value: 'table',
				label: this.$t('explore.corpora.showAs.table').toString(),
			}, {
				value: 'docs',
				label: this.$t('explore.corpora.showAs.docs').toString(),
			}, {
				value: 'tokens',
				label: this.$t('explore.corpora.showAs.tokens').toString(),
			}];
		},

		mainTokenTextDirection: CorpusStore.get.textDirection,
	},
	methods: {
		updateTokenAnnotation(index: number, id: string) {
			ExploreStore.actions.ngram.token({
				index,
				token: { id }
			});
		},
		updateTokenValue(index: number, value: string) {
			ExploreStore.actions.ngram.token({
				index,
				token: { value }
			});
		},
		autocompleteUrl(annot: CorpusStore.NormalizedAnnotation) {
			return blacklabPaths.autocompleteAnnotation(INDEX_ID, annot.annotatedFieldId, annot.id);
		}
	},
	created() {
		this.corporaGroupDisplayMode = this.corporaGroupDisplayModeOptions[0].value;
	}
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

	&+& {
		margin-left: 15px;
	}

	> .form-control,
	> .lexicon,
	> .combobox {
		margin-top: 8px;
	}
}

</style>
