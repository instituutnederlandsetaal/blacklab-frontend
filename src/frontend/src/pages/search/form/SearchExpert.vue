<template>
	<div>
		<h3>{{$t('search.expert.corpusQueryLanguage') + (isParallelCorpus ? '' : ':') }}
			<a class='help' target='_blank' href='https://inl.github.io/BlackLab/guide/corpus-query-language.html'
				:title="$t('widgets.learnMore').toString()">🛈</a>
		</h3>
		<template v-if="!isParallelCorpus">
			<!-- Regular (non-parallel) corpus -->
			<textarea class="form-control querybox" name="querybox" rows="7" v-model="mainQuery"></textarea>
		</template>
		<div v-else class="parallel ">
			<!-- TODO see if we can reuse the ParallelSourceAndTarget component for this section. -->
			<!-- Parallel corpus -->

			<!-- Parallel source + its input box -->
			<div class="form-group">
				<label class="control-label" for="sourceVersion">{{$t('search.parallel.queryForSourceVersion')}}
					<SelectPicker id="sourceVersion" :options="pSourceOptions"
						v-model="pSourceValue" data-menu-width="grow" hideEmpty/>
				</label>
				<textarea class="form-control querybox" name="querybox" rows="7" v-model="mainQuery"></textarea>
			</div>

			<!-- Parallel targets + their input boxes -->
			<div v-for="(field, index) in pTargets" :key="field.value" class="form-group">
				<label @click.prevent>
					{{$t('search.parallel.queryForTargetVersion')}}
					<button type="button" class="targetVersion" @click="removeTarget(field.value)" :title="$t('widgets.clickToRemove').toString()">
						{{ field.label }}
					</button>
				</label>

				<textarea class="form-control querybox" rows="7"
					:value="targetQueries[index]"
					@input="changeTargetQuery(index, $event)"
				></textarea>
			</div>

			<div v-if="pTargetOptions.length" class="form-group">
				<!-- Parallel target extra field selector. -->
				<label>{{ $t(pTargetValue.length ? 'search.parallel.addTargetVersion' : 'search.parallel.chooseTargetVersion') }}</label>
				<div>
					<!--
						Note: this selectpicker only allows a single value. Then every time the user selects something, the selected value is removed
						 from the available options.
						Deselecting happens in a list elsewhere in the UI.
					-->
					<SelectPicker :options="pTargetOptions" @input="addTarget($event)" hideEmpty/>
				</div>
			</div>

			<AlignBy block/>
		</div>
	</div>
</template>

<script lang="ts">

import ParallelFields from '@/pages/search/form/parallel/ParallelFields';

import * as PatternStore from '@/store/search/form/patterns';

import SelectPicker from '@/components/SelectPicker.vue';
import MultiValuePicker from '@/components/MultiValuePicker.vue';
import AlignBy from '@/pages/search/form/AlignBy.vue';

export default ParallelFields.extend({
	components: {
		SelectPicker,
		MultiValuePicker,
		AlignBy,
	},
	computed: {
		// The query (or source query, for parallel corpora)
		mainQuery: {
			get() { return PatternStore.getState().expert.query ?? ''; },
			set: PatternStore.actions.expert.query,
		},

		// If this is a parallel corpus: the target queries
		targetQueries: {
			get() { return PatternStore.getState().expert.targetQueries; },
			set: PatternStore.actions.expert.targetQueries,
		},
	},
	methods: {
		changeTargetQuery(index: number, event: Event): void {
			const textarea = event.target as HTMLTextAreaElement;
			PatternStore.actions.expert.changeTargetQuery({index, value: textarea.value});
		},
	}
});
</script>

<style lang="scss" scoped>

h3 .help {
	font-size: 0.8em;

	// superscript
	position: relative;
	top: -0.5em;
	color: black;
	opacity: 0.5;
}

.querybox {
	width: 100%;
	resize: none;
	margin-bottom: 10px;
}

.parallel {
	margin: 15px 0;

	label {
		margin-top: 10px;
	}
	textarea, .querybox {
		width: 100%;
		resize: none;
		margin: 0;
	}
	#sourceVersion, .targetVersion {
		font-weight: normal;
	}
	button.targetVersion {
		display: inline-block;
		margin: 2px;
		user-select: none;

		// position: relative;
		// top: 1px;

		background-color: lighten(#337ab7, 40); // $panel-color (global.scss); maybe separate variables into file we can import here?
		color: black;
		padding: 7px;
		border-radius: 3px;
		border: none;
		cursor: pointer;
		&::after {
			font-weight: bold;
			content: '✕';
			margin-left: 5px;
		}
	}
}

</style>