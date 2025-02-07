<template>
	<div>
		<div class="tab-content tab-pane form-horizontal">
			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="stopwords">{{$t('analyse.wordlist.stopwords')}}</label>
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
							:title="$t('analyse.wordlist.uploadTitle')"
							:id="'stopwordsInput'"
							@change="onFileChanged"
						>
					</label>
				</div>
				{{$t('analyse.wordlist.stopwordsNote')}}
			</div>
			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="is-case">{{$t('analyse.wordlist.isCase')}}
					<a class='help' href='javascript:void(0);' :title="$t('analyse.wordlist.isCaseHelp').toString()">🛈</a>
				</label>
				<div class="col-xs-8 col-md-5">
					<input type="checkbox" name="is-case" id="is-case" v-model="isCase"/>  {{$t('analyse.wordlist.isCaseConsider')}}
				</div>
			</div>

			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="show-number">{{$t('analyse.wordlist.showNumber')}}</label>
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
				<label class="col-xs-4 col-md-2" for="dispersion-alg">{{$t('analyse.wordlist.dispersionAlg')}}</label>
				<div class="col-xs-8">
					<SelectPicker
						placeholder="Show as"
						data-id="dispersion-alg"
						data-width="100%"
						style="max-width: 400px;"
						hideEmpty
						allowHtml
						:options="wordlistDispersionAlgOptions"
						v-model="dispersionAlg"
					/>
				</div>
			</div>

			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="adjusted-alg">{{$t('analyse.wordlist.adjustedAlg')}}</label>
				<div class="col-xs-8">
					<SelectPicker
						placeholder="Show as"
						data-id="adjusted-alg"
						data-width="100%"
						style="max-width: 400px;"
						hideEmpty
						allowHtml
						:options="wordlistAdjustedAlgOptions"
						v-model="adjustedAlg"
					/>
				</div>
			</div>

			<div class="form-group" v-if="showPartN">
				<label class="col-xs-4 col-md-2" for="part-n">{{$t('analyse.wordlist.partN')}}
					<a class='help' href='javascript:void(0);' :title="$t('analyse.wordlist.partNHelp').toString()">🛈</a>
				</label>
				<div class="col-xs-8 col-md-5">
					<input
						class="form-control"
						name="part-n"
						id="part-n"
						type="number"
						min="1"
						:max="partNMax"
						v-model.number="partN"
					/>
				</div>
			</div>
		</div>
	</div>
</template> 

<script lang="ts">
import Vue from 'vue';

import * as WordlistStore from '@/store/search/form/analyse/wordlist'

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
			get: WordlistStore.get.stopwords.value,
			set: WordlistStore.actions.stopwords.value
		},

		showNumber: {
			get: WordlistStore.get.showNumber.size,
			set: WordlistStore.actions.showNumber.size,
		},
		showNumberMax: WordlistStore.get.showNumber.maxSize,

		isCase: {
			get: WordlistStore.get.isCase.value,
			set: WordlistStore.actions.isCase.value
		},

		dispersionAlg: {
			get: WordlistStore.get.dispersionAlg.value,
			set: WordlistStore.actions.dispersionAlg.value
		},

		adjustedAlg: {
			get: WordlistStore.get.adjustedAlg.value,
			set: WordlistStore.actions.adjustedAlg.value
		},

		partN: {
			get: WordlistStore.get.partN.size,
			set: WordlistStore.actions.partN.size,
		},
		partNMax: WordlistStore.get.partN.maxSize,

		wordlistDispersionAlgOptions() { 
			return [
				"None",
				"Carroll's D₂",
				"Gries's DP",
				"Gries's DP (Normalization)",
				"Juilland's D",
				"Lyne's D₃",
				"Rosengren's S",
				"Zhang's Distributional Consistency",
				"Average Logarithmic Distance",
				"Average Reduced Frequency",
				"Average Waiting Time"
			];
		},

		wordlistAdjustedAlgOptions() {
			return [
				"None",
				"Carroll's Uₘ",
				"Engwall's FM",
				"Juilland's U" ,
				"Kromer's UR",
				"Rosengren's KF",
				"Average Logarithmic Distance",
				"Average Reduced Frequency",
				"Average Waiting Time"
			];
		},

		showPartN() {
			if(!(this.dispersionAlg == 'Average Logarithmic Distance' || this.dispersionAlg == 'Average Reduced Frequency' || this.dispersionAlg == 'Average Waiting Time' || this.dispersionAlg == 'None') || !(this.adjustedAlg == 'Average Logarithmic Distance' || this.adjustedAlg == 'Average Reduced Frequency' || this.adjustedAlg == 'Average Waiting Time' || this.adjustedAlg == 'None') ) {
				return true;
			} else {
				return false;
			}
		}

	},
	methods: {
		onFileChanged(event: Event) {
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
