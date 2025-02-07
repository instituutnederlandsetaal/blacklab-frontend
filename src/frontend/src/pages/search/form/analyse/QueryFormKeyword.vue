<template>
	<div>
		<div class="tab-content tab-pane form-horizontal">
			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="stopwords">{{$t('analyse.keyword.stopwords')}}</label>
				<div style="display: flex; align-items: center;" class="col-xs-8 col-md-5">
					<div style="flex-grow: 1;">
						<input
							class="form-control"
							name="stopwords"
							id="stopwords"
							v-model="stopwords"
						/>
					</div>
					<label
						class="btn btn-default file-input-button"
						:for="'keywordInput'"
					>
						<span class="fa fa-upload fa-fw"></span>
						<input
							type="file"
							:title="$t('analyse.keyword.uploadTitle')"
							:id="'stopwordsInput'"
							@change="onFileChangedKeyword"
						>
					</label>
				</div>
				{{$t('analyse.keyword.stopwordsNote')}}
			</div>
			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="is-case">{{$t('analyse.keyword.isCase')}}
					<a class='help' href='javascript:void(0);' :title="$t('analyse.keyword.isCaseHelp').toString()">🛈</a>
				</label>
				<div class="col-xs-8 col-md-5">
					<input type="checkbox" name="is-case" id="is-case" v-model="isCase"/>  {{$t('analyse.keyword.isCaseConsider')}}
				</div>
			</div>

			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="show-number">{{$t('analyse.keyword.showNumber')}}</label>
				<div class="col-xs-8 col-md-5">
					<input
						class="form-control"
						name="show-number"
						id="show-number"
						type="number"
						min="1"
						:max="showNumberMax"
						v-model.number="showNumber"
					/>
				</div>
			</div>

			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="keyword-alg">{{$t('analyse.keyword.alg')}}</label>
				<div class="col-xs-8">
					<SelectPicker
						placeholder="Show as"
						data-id="keyword-alg"
						data-width="100%"
						style="max-width: 400px;"
						hideEmpty
						allowHtml
						:options="keywordAlgOptions"
						v-model="keywordAlg"
					/>
				</div>
			</div>

			<div v-if="keywordAlg==='TextRank'">
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="damping-factor">{{$t('analyse.keyword.dampingFactor')}}</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="damping-factor"
							id="damping-factor"
							type="number"
							:min="dampingFactorMin"
							:max="dampingFactorMax"
							step="0.01"
							v-model.number="dampingFactor"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="max-iter">{{$t('analyse.keyword.maxIter')}}</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="max-iter"
							id="max-iter"
							type="number"
							:min="maxIterMin"
							:max="maxIterMax"
							v-model.number="maxIter"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="min-diff">{{$t('analyse.keyword.minDiff')}}</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="min-diff"
							id="min-diff"
							type="number"
							:min="minDiffMin"
							:max="minDiffMax"
							step="0.00001"
							v-model.number="minDiff"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="window-size">{{$t('analyse.keyword.windowSize')}}</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="window-size"
							id="window-size"
							type="number"
							:min="windowSizeMin"
							:max="windowSizeMax"
							v-model.number="windowSize"
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
</template> 

<script lang="ts">
import Vue from 'vue';

import * as KeywordStore from '@/store/search/form/analyse/keyword'

import SelectPicker, {Option, OptGroup} from '@/components/SelectPicker.vue';

import debug from '@/utils/debug';

export default Vue.extend({
	components: {
		SelectPicker,
	},
	data: () => ({
		debug
	}),
	computed: {
		stopwords: {
			get: KeywordStore.get.stopwords.value,
			set: KeywordStore.actions.stopwords.value
		},

		showNumber: {
			get: KeywordStore.get.showNumber.size,
			set: KeywordStore.actions.showNumber.size,
		},
		showNumberMax: KeywordStore.get.showNumber.maxSize,

		isCase: {
			get: KeywordStore.get.isCase.value,
			set: KeywordStore.actions.isCase.value
		},

		keywordAlg: {
			get: KeywordStore.get.keywordAlg.value,
			set: KeywordStore.actions.keywordAlg.value
		},
		
		// when keywordAlg is "TextRank"
		dampingFactor: {
			get: KeywordStore.get.dampingFactor.size,
			set: KeywordStore.actions.dampingFactor.size,
		},
		dampingFactorMax: KeywordStore.get.dampingFactor.maxSize,
		dampingFactorMin: KeywordStore.get.dampingFactor.minSize,

		maxIter: {
			get: KeywordStore.get.maxIter.size,
			set: KeywordStore.actions.maxIter.size,
		},
		maxIterMax: KeywordStore.get.maxIter.maxSize,
		maxIterMin: KeywordStore.get.maxIter.minSize,

		minDiff: {
			get: KeywordStore.get.minDiff.size,
			set: KeywordStore.actions.minDiff.size,
		},
		minDiffMax: KeywordStore.get.minDiff.maxSize,
		minDiffMin: KeywordStore.get.minDiff.minSize,

		windowSize: {
			get: KeywordStore.get.windowSize.size,
			set: KeywordStore.actions.windowSize.size,
		},
		windowSizeMax: KeywordStore.get.windowSize.maxSize,
		windowSizeMin: KeywordStore.get.windowSize.minSize,

		keywordAlgOptions() { 
			return [
				// "TF-IDF",
				"TextRank",
			];
		},

	},
	methods: {
		onFileChangedKeyword(event: Event) {
			const self = this;
			const fileInput = event.target as HTMLInputElement;
			const file = fileInput.files && fileInput.files[0];
			if (file != null) {
				const fr = new FileReader();
				fr.onload = function() {
					self.stopwords = (fr.result as string).trim().replace(/\s+/g, '|');
				};
				fr.readAsText(file);
			} else {
				self.stopwords = '';
			}
			(event.target as HTMLInputElement).value = '';
		},

	},
});
</script>

<style lang="scss">

</style>
