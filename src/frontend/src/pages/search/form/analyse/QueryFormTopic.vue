<template>
	<div>
		<div class="tab-content tab-pane form-horizontal">
			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="stopwords">{{$t('analyse.topic.stopwords')}}
                    <a class='help' href='javascript:void(0);' :title="$t('analyse.topic.stopwordsHelp').toString()">🛈</a>
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
							:title="$t('analyse.topic.stopwordsHelp')"
							:id="'stopwordsInput'"
							@change="onFileChanged"
						>
					</label>
				</div>
				*{{$t('analyse.topic.stopwordsNote')}}
			</div>

			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="topic-number">{{$t('analyse.topic.topicNumber')}}
					<a class='help' href='javascript:void(0);' :title="$t('analyse.topic.topicNumberHelp').toString()">🛈</a>
				</label>
				<div class="col-xs-8 col-md-5">
					<input
						class="form-control"
						name="topic-number"
						id="topic-number"
						type="number"
						min="1"
						:max="topicNumberMax"
						v-model.number="topicNumber"
					/>
				</div>
			</div>

			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="show-number">{{$t('analyse.topic.showNumber')}}
					<a class='help' href='javascript:void(0);' :title="$t('analyse.topic.showNumberHelp').toString()">🛈</a>
				</label>
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
				<label class="col-xs-4 col-md-2" for="iteration">{{$t('analyse.topic.iteration')}}</label>
				<div class="col-xs-8 col-md-5">
					<input
						class="form-control"
						name="iteration"
						id="iteration"
						type="number"
						min="1"
						:max="iterationMax"
						v-model.number="iteration"
					/>
				</div>
			</div>

			<div class="form-group">
				<label class="col-xs-4 col-md-2" for="is-case">{{$t('analyse.topic.isCase')}}
					<a class='help' href='javascript:void(0);' :title="$t('analyse.topic.isCaseHelp').toString()">🛈</a>
				</label>
				<div class="col-xs-8 col-md-5">
					<input type="checkbox" name="is-case" id="is-case" v-model="isCase"/> {{$t('analyse.topic.isCaseConsider')}}
				</div>
			</div>

			<br>
		</div>

	</div>
</template>

<script lang="ts">

import Vue from 'vue';
import * as TopicStore from '@/store/search/form/analyse/topic';
import debug from '@/utils/debug';

export default Vue.extend({
	data: () => ({
		debug
	}),
	computed: {
		stopwords: {
			get: TopicStore.get.stopwords.value,
			set: TopicStore.actions.stopwords.value
		},

		topicNumber: {
			get: TopicStore.get.topicNumber.size,
			set: TopicStore.actions.topicNumber.size,
		},
		topicNumberMax: TopicStore.get.topicNumber.maxSize,

		showNumber: {
			get: TopicStore.get.showNumber.size,
			set: TopicStore.actions.showNumber.size,
		},
		showNumberMax: TopicStore.get.showNumber.maxSize,

		iteration: {
			get: TopicStore.get.iteration.size,
			set: TopicStore.actions.iteration.size,
		},
		iterationMax: TopicStore.get.iteration.maxSize,

		isCase: {
			get: TopicStore.get.isCase.value,
			set: TopicStore.actions.isCase.value,
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
					self.stopwords = (fr.result as string).trim().replace(/\s+/g, '|');
				};
				fr.readAsText(file);
			} else {
				self.stopwords = '';
			}
			(event.target as HTMLInputElement).value = '';
		}
	}

})
</script>

<style lang="scss">

</style>
