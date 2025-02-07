<template>
	<div>
		<div>
			<div class="tab-content tab-pane form-horizontal">
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="stopwords">{{$t('analyse.collocation.stopwords')}}
						<a class='help' href='javascript:void(0);' :title="$t('analyse.collocation.stopwordsHelp').toString()">🛈</a>
					</label>
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
							:for="'stopwordsInput'"
						>
							<span class="fa fa-upload fa-fw"></span>
							<input
								type="file"
								:title="$t('analyse.collocation.uploadTitle')"
								:id="'stopwordsInput'"
								@change="onStopwordsFileChanged"
							>
						</label>
					</div>
					{{$t('analyse.collocation.stopwordsNote')}}
				</div>
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="is-case">{{$t('analyse.collocation.isCase')}}
						<a class='help' href='javascript:void(0);' :title="$t('analyse.collocation.isCaseHelp').toString()">🛈</a>
					</label>
					<div class="col-xs-8 col-md-5">
						<input type="checkbox" name="is-case" id="is-case" v-model="isCase"/>  {{$t('analyse.collocation.isCaseConsider')}}
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="show-number">{{$t('analyse.collocation.showNumber')}}</label>
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
					<label class="col-xs-4 col-md-2" for="around-number">{{$t('analyse.collocation.aroundNumber')}}</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="around-number"
							id="around-number"
							type="number"
							min="0"
							:max="aroundNumberMax"
							v-model.number="aroundNumber"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="test-alg">{{$t('analyse.collocation.testAlg')}}</label>
					<div class="col-xs-8">
						<SelectPicker
							placeholder="Show as"
							data-id="test-alg"
							data-width="100%"
							style="max-width: 400px;"
							hideEmpty
							allowHtml
							:options="testAlgOptions"
							v-model="testAlg"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="bayes-alg">{{$t('analyse.collocation.bayesAlg')}}</label>
					<div class="col-xs-8">
						<SelectPicker
							placeholder="Show as"
							data-id="bayes-alg"
							data-width="100%"
							style="max-width: 400px;"
							hideEmpty
							allowHtml
							:options="bayesAlgOptions"
							v-model="bayesAlg"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="effect-size-alg">{{$t('analyse.collocation.effectSizeAlg')}}</label>
					<div class="col-xs-8">
						<SelectPicker
							placeholder="Show as"
							data-id="effect-size-alg"
							data-width="100%"
							style="max-width: 400px;"
							hideEmpty
							allowHtml
							:options="effectSizeAlgOptions"
							v-model="effectSizeAlg"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="keywords">
						{{$t('analyse.collocation.keywords')}}
						<br>
					</label>
					<div class="col-xs-6" >
						<KeywordInput />
					</div>
				</div>

			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as CollocationStore from '@/store/search/form/analyse/collocation';

import SelectPicker, {Option, OptGroup} from '@/components/SelectPicker.vue';
import KeywordInput from '@/pages/search/form/analyse/KeywordInput.vue';

import debug from '@/utils/debug';

export default Vue.extend({
	components: {
		SelectPicker,
		KeywordInput
	},
	data: () => ({
		debug,
	}),
	computed: {
		stopwords: {
			get: CollocationStore.get.stopwords.value,
			set: CollocationStore.actions.stopwords.value
		},

		keywords: {
			get: CollocationStore.get.keywords.value,
			set: CollocationStore.actions.keywords.value
		},

		showNumber: {
			get: CollocationStore.get.showNumber.size,
			set: CollocationStore.actions.showNumber.size,
		},
		showNumberMax: CollocationStore.get.showNumber.maxSize,

		aroundNumber: {
			get: CollocationStore.get.aroundNumber.size,
			set: CollocationStore.actions.aroundNumber.size,
		},
		aroundNumberMax: CollocationStore.get.aroundNumber.maxSize,

		isCase: {
			get: CollocationStore.get.isCase.value,
			set: CollocationStore.actions.isCase.value
		},

		testAlg: {
			get: CollocationStore.get.testAlg.value,
			set: CollocationStore.actions.testAlg.value
		},

		bayesAlg: {
			get: CollocationStore.get.bayesAlg.value,
			set: CollocationStore.actions.bayesAlg.value
		},

		effectSizeAlg: {
			get: CollocationStore.get.effectSizeAlg.value,
			set: CollocationStore.actions.effectSizeAlg.value
		},

		testAlgOptions() {
			return [
				'None',
				'Fisher\'s Exact Test',
				'Log-likelihood Ratio Test',
				'Pearson\'s Chi-squared Test',
				'Student\'s t-test (1-sample)',
				'z-score',
			];
		},

		bayesAlgOptions() {
			return [
				'None',
				'Log-likelihood Ratio Test',
			];
		},

		effectSizeAlgOptions() {
			return [
				'None',
				'%DIFF',
				'Cubic Association Ratio',
				'Dice\'s Coefficient',
				'Difference Coefficient',
				'Jaccard Index',
				'Log Ratio',
				'Log-Frequency Biased MD',
				'logDice',
				'MI.log-f',
				'Minimum Sensitivity',
				'Mutual Dependency',
				'Mutual Expectation',
				'Mutual Information',
				'Odds Ratio',
				'Pointwise Mutual Information',
				'Poisson Collocation Measure',
				'Squared Phi Coefficient',
			];
		},
	},
	methods: {
		onStopwordsFileChanged(event: Event) {
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
