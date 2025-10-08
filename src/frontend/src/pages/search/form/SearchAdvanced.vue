<template>
	<div>
		<template v-if="!isParallelCorpus">
			<!-- Regular (non-parallel) corpus -->
			<!-- <div class="querybuilder"></div> -->
			 <CqlQueryBuilder v-model="mainQuery" />
		</template>
		<div v-else>
			<!-- Parallel corpus -->
			<div class="qb-par-wrap">
				<label class="control-label" for="sourceVersion">{{$t('search.parallel.queryForSourceVersion')}}
					<SelectPicker id="sourceVersion" :options="pSourceOptions"
						v-model="pSourceValue" data-menu-width="grow" hideEmpty/>
				</label>
				<span v-if="errorNoParallelSourceVersion" class="error">
					{{ $t('search.parallel.errorNoSourceVersion') }}
				</span>
				<CqlQueryBuilder v-model="mainQuery" />
			</div>

			<div class="qb-par-wrap" v-for="(field, index) in pTargets" :key="field.value">
				<label class="control-label" @click.prevent>{{$t('search.parallel.queryForTargetVersion')}}
					<button type="button" class="targetVersion" @click="removeTarget(field.value)" :title="$t('widgets.clickToRemove').toString()">
						{{ field.label }}
					</button>
				</label>
				<CqlQueryBuilder :key="field.value" :value="targetQueries[index]" @input="changeTargetQuery(index, $event)" />
			</div>

			<div v-if="pTargetOptions.length" class="add-target-version form-group">
				<label>{{ $t(pTargetValue.length ? 'search.parallel.addTargetVersion' : 'search.parallel.andCompareWithTargetVersions') }}</label>
				<div>
					<!--
						Note: this selectpicker only allows a single value. Then every time the user selects something, the selected value is removed
						 from the available options.
						Deselecting happens in a list elsewhere in the UI.
					-->
					<SelectPicker :options="pTargetOptions" @input="addTarget($event)" hideEmpty/>
				</div>
			</div>

			<AlignBy v-if="pTargets.length" block />
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
import CqlQueryBuilder from '@/components/cql/CqlQueryBuilder.vue';

import ParallelFields from '@/pages/search/form/parallel/ParallelFields';
import { CqlGenerator, CqlQueryBuilderData } from '@/components/cql/cql-types';

export default ParallelFields.extend({
	components: {
		SelectPicker,
		MultiValuePicker,
		AlignBy,
		CqlQueryBuilder
	},
	props: {
		errorNoParallelSourceVersion: { default: false, type: Boolean },
	},
	computed: {
		// The query (or source query, for parallel corpora)
		mainQuery: {
			get() { return PatternStore.getState().advanced.query; },
			set(v: any) { PatternStore.actions.advanced.query(v); }
		},

		// If this is a parallel corpus: the target queries
		targetQueries: {
			get() { return  PatternStore.getState().advanced.targetQueries; },
		},
	},
	methods: {
		copyAdvancedQuery() {
			const q = PatternStore.getState().advanced.query;
			PatternStore.actions.expert.query(q ? CqlGenerator.rootCql(q) : '');
			for (let i = 0; i < PatternStore.getState().advanced.targetQueries.length; i++) {
				PatternStore.actions.expert.changeTargetQuery({
					index: i,
					value: CqlGenerator.rootCql(PatternStore.getState().advanced.targetQueries[i]) || ''
				});
			}
			InterfaceStore.actions.patternMode('expert');
		},
		changeTargetQuery(index: number, value: CqlQueryBuilderData) {
			PatternStore.actions.advanced.changeTargetQuery({ index, value });
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

	.error {
		color: red;
		margin: 0.5em 0 0 1em;
		font-weight: bold;
	}
}

</style>