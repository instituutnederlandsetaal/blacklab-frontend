<template>
	<div>
		<div>
			<div class="tab-content tab-pane form-horizontal">
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="stopwords">{{$t('analyse.cooccur.stopwords')}}</label>
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
								title="Upload a list of values"
								:id="'stopwordsInput'"
								@change="onStopwordsFileChanged"
							>
						</label>
					</div>
					{{$t('analyse.cooccur.stopwordsNote')}}
				</div>
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="is-case">{{$t('analyse.cooccur.isCase')}}
						<a class='help' href='javascript:void(0);' :title="$t('analyse.cooccur.isCaseHelp').toString()">🛈</a>
					</label>
					<div class="col-xs-8 col-md-5">
						<input type="checkbox" name="is-case" id="is-case" v-model="isCase"/>  {{$t('analyse.cooccur.isCaseConsider')}}
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="show-number">{{$t('analyse.cooccur.showNumber')}}</label>
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
					<label class="col-xs-4 col-md-2" for="edge-alg">{{$t('analyse.cooccur.edgeAlg')}}
						<a class='help' href='javascript:void(0);' :title="$t('analyse.cooccur.edgeAlgHelp').toString()">🛈</a>
					</label>
					<div class="col-xs-8">
						<SelectPicker
							placeholder="Show as"
							data-id="edge-alg"
							data-width="100%"
							style="max-width: 400px;"
							hideEmpty
							allowHtml
							:options="edgeAlgOptions"
							v-model="edgeAlg"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="keywords">
						{{$t('analyse.cooccur.keywords')}}
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

import * as CooccurStore from '@/store/search/form/analyse/cooccur';

import SelectPicker, {Option, OptGroup} from '@/components/SelectPicker.vue';
import KeywordInput from '@/pages/search/form/analyse/KeywordInput.vue';

import debug from '@/utils/debug';

export default Vue.extend({
	components: {
		SelectPicker,
		KeywordInput
	},
	data: () => ({
		debug
	}),
	computed: {
		stopwords: {
			get: CooccurStore.get.stopwords.value,
			set: CooccurStore.actions.stopwords.value
		},

		showNumber: {
			get: CooccurStore.get.showNumber.size,
			set: CooccurStore.actions.showNumber.size,
		},
		showNumberMax: CooccurStore.get.showNumber.maxSize,

		isCase: {
			get: CooccurStore.get.isCase.value,
			set: CooccurStore.actions.isCase.value
		},

		edgeAlg: {
			get: CooccurStore.get.edgeAlg.value,
			set: CooccurStore.actions.edgeAlg.value
		},

	
		edgeAlgOptions() {
			return [
				'Jaccard',
				'Simpson',
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
