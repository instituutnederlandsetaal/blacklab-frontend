<template>
	<div>
		<div>
			<div class="tab-content tab-pane form-horizontal">
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="stopwords">{{$t('analyse.network.stopwords')}}</label>
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
								@change="onFileChanged"
							>
						</label>
					</div>
					{{$t('analyse.network.stopwordsNote')}}
				</div>
				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="is-case">{{$t('analyse.network.isCase')}}
						<a class='help' href='javascript:void(0);' :title="$t('analyse.network.isCaseHelp').toString()">🛈</a>
					</label>
					<div class="col-xs-8 col-md-5">
						<input type="checkbox" name="is-case" id="is-case" v-model="isCase"/>  {{$t('analyse.network.isCaseConsider')}}
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="show-number">{{$t('analyse.network.showNumber')}}</label>
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
					<label class="col-xs-4 col-md-2" for="scope">{{$t('analyse.network.scope')}}</label>
					<div class="col-xs-8">
						<SelectPicker
							placeholder="Show as"
							data-id="scope"
							data-width="100%"
							style="max-width: 400px;"
							hideEmpty
							allowHtml
							:options="scopeOptions"
							v-model="scope"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="edge-alg">{{$t('analyse.network.edgeAlg')}}
						<a class='help' href='javascript:void(0);' :title="$t('analyse.network.edgeAlgHelp').toString()">🛈</a>
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
					<label class="col-xs-4 col-md-2" for="weight-threshold">{{$t('analyse.network.weightThreshold')}}</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="weight-threshold"
							id="weight-threshold"
							type="number"
							:min="weightThresholdMin"
							step="0.01"
							v-model.number="weightThreshold"
						/>
					</div>
				</div>

				<div class="form-group">
					<label class="col-xs-4 col-md-2" for="num-communities">{{$t('analyse.network.numCommunities')}}
						<a class='help' href='javascript:void(0);' :title="$t('analyse.network.numCommunitiesHelp').toString()">🛈</a>
					</label>
					<div class="col-xs-8 col-md-5">
						<input
							class="form-control"
							name="num-communities"
							id="num-communities"
							type="number"
							min="1"
							:max="numCommunitiesMax"
							v-model.number="numCommunities"
						/>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import * as NetworkStore from '@/store/search/form/analyse/network';

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
			get: NetworkStore.get.stopwords.value,
			set: NetworkStore.actions.stopwords.value
		},

		showNumber: {
			get: NetworkStore.get.showNumber.size,
			set: NetworkStore.actions.showNumber.size,
		},
		showNumberMax: NetworkStore.get.showNumber.maxSize,

		scope: {
			get: NetworkStore.get.scope.value,
			set: NetworkStore.actions.scope.value
		},

		isCase: {
			get: NetworkStore.get.isCase.value,
			set: NetworkStore.actions.isCase.value
		},

		edgeAlg: {
			get: NetworkStore.get.edgeAlg.value,
			set: NetworkStore.actions.edgeAlg.value
		},

		weightThreshold: {
			get: NetworkStore.get.weightThreshold.size,
			set: NetworkStore.actions.weightThreshold.size,
		},
		weightThresholdMin: NetworkStore.get.weightThreshold.minSize,

		numCommunities: {
			get: NetworkStore.get.numCommunities.size,
			set: NetworkStore.actions.numCommunities.size,
		},
		numCommunitiesMax: NetworkStore.get.numCommunities.maxSize,

		scopeOptions() { 
			return [
				'sentence',
				'paragraph',
				'document'
			];
		},

		edgeAlgOptions() {
			return [
				'Jaccard',
				'Simpson',
			];
		},
	},
	methods: {
		onFileChanged(event: Event) {
			const self = this;
			const fileInput = event.target as HTMLInputElement;
			const file = fileInput.files && fileInput.files[0];
			if (file != null) {
				const fr = new FileReader();
				fr.onload = function() {
					// Replace all whitespace with pipes,
					// Same as the querybuilder wordlist upload
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
