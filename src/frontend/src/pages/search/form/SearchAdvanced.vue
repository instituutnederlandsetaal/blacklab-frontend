<template>
	<div>
		<template v-if="!isParallelCorpus">
			<!-- Regular (non-parallel) corpus -->
			<div class="querybuilder"></div>
		</template>
		<div v-else>
			<!-- Parallel corpus -->
			<div class="qb-par-wrap">
				<label class="control-label" for="sourceVersion">{{$t('search.parallel.queryForSourceVersion')}}
					<SelectPicker id="sourceVersion" :options="pSourceOptions"
						v-model="pSourceValue" data-menu-width="grow" hideEmpty/>
				</label>
				<div class="querybuilder"></div>
			</div>

			<div class="qb-par-wrap" v-for="field in pTargets" :key="field.value">
				<label class="control-label" @click.prevent>{{$t('search.parallel.queryForTargetVersion')}}
					<button type="button" class="targetVersion" @click="removeTarget(field.value)" :title="$t('widgets.clickToRemove').toString()">
						{{ field.label }}
					</button>
				</label>
				<div class="querybuilder"></div>
			</div>

			<div v-if="pTargetOptions.length" class="add-target-version form-group">
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

			<AlignBy block />
		</div>

		<button type="button" class="btn btn-default btn-sm" @click="copyAdvancedQuery">{{$t('search.advanced.copyAdvancedQuery')}}</button>
	</div>
</template>

<script lang="ts">
import * as PatternStore from '@/store/search/form/patterns';
import * as InterfaceStore from '@/store/search/form/interface';

import SelectPicker from '@/components/SelectPicker.vue';
import MultiValuePicker from '@/components/MultiValuePicker.vue';
import AlignBy from '@/pages/search/form/AlignBy.vue';
import { initQueryBuilders } from '@/initQueryBuilders';

import ParallelFields from '@/pages/search/form/parallel/ParallelFields';

export default ParallelFields.extend({
	components: {
		SelectPicker,
		MultiValuePicker,
		AlignBy,
	},
	data: () => ({
		queryBuilderLoading: false,
	}),
	computed: {
		// The query (or source query, for parallel corpora)
		mainQuery: {
			get() { return PatternStore.getState().advanced.query || undefined; },
			set: PatternStore.actions.advanced.query,
		},

		// If this is a parallel corpus: the target queries
		targetQueries: {
			get() {
				const queries = PatternStore.getState().expert.targetQueries;
				return queries.map(q => q == null || q == '_' || q == '[]*' ? '' : q);
			},
			set: PatternStore.actions.advanced.targetQueries,
		},

		refreshQueryBuilders(): any {
			return {
				targetValue: this.pTargetValue,
				// little stupid, but we need a way to know when the locale has changed.
				// i18n.locale is not reactive?
				localeChange: this.$i18n.locale
			}
		}
	},
	methods: {
		copyAdvancedQuery() {
			const q = PatternStore.getState().advanced.query;
			PatternStore.actions.expert.query(q);
			for (let i = 0; i < PatternStore.getState().advanced.targetQueries.length; i++) {
				PatternStore.actions.expert.changeTargetQuery({
					index: i,
					value: PatternStore.getState().advanced.targetQueries[i]
				});
			}
			InterfaceStore.actions.patternMode('expert');
		},
	},
	watch: {
		refreshQueryBuilders: {
			immediate: true,
			handler(v) {
				if (this.queryBuilderLoading) return;
				this.queryBuilderLoading = true;
				setTimeout(() => {
					initQueryBuilders(this).then(() => {
						this.queryBuilderLoading = false;
					});
				}, 100);
			},
		}
	},
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

.parallel {
	margin: 15px 0;

	label {
		margin-top: 10px;
	}
	textarea/*, .querybox*/ {
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

		background-color: lighten(#337ab7, 40); // $panel-color (global.scss); maybe separate variables into file we can import here?
		color: black;
		padding: 7px;
		border-radius: 3px;
		border: none;
		&::after {
			font-weight: bold;
			content: '✕';
			margin-left: 5px;
		}
	}
}

</style>