<template>
	<div>
		<button @click="$emit('submit')" :disabled="loading">OK</button>
		<h3>{{currentStep}}</h3>
		<button @click="reset" :disabled="loading">Reset</button>
		<!-- main annotation values -->
		<div style="display: flex;">
			<ul class="list-unstyled" style="width: auto; max-width: 200px; display: flex; flex-direction: column;">
				<li v-if="!mainValues"><span class="fa fa-spinner fa-spin"></span> loading</li>
				<template v-else-if="mainValues.length">
					<li v-for="v in mainValues" :key="v.value">
						<button type="button"
							style="display: flex; width: 100%; text-align: left;"
							@click="activeValue = v.value"
							class="btn btn-default"
							:class="{active: activeValue === v.value}"
						>
							<span style="flex-grow: 1;">{{v.value}}</span> <span v-if="v.loading" class="fa fa-spinner fa-spin" style="align-self: center; margin-left: 5px;"></span>
						</button>
					</li>
				</template>
				<li v-else class="font-italic text-muted">No values!</li>
			</ul>

			<div style="padding: 5px;">
				<span v-if="!display" class="font-italic text-muted">Click a value to see resolve progress</span>

				<div v-else style="display: flex; flex-grow: 1; overflow-y: auto; flex-direction: row; flex-wrap: wrap;">
					<div v-for="a in display" :key="a.id" style="padding: 0px 5px;">
						<h4 style="margin-top: 0;">{{a.id}}</h4>
						<div v-if="a.loading"><span class="fa fa-spinner fa-spin"></span> Loading values in corpus</div>
						<em v-else-if="!a.values.length" class="text-muted">No values</em>
						<ul v-else class="list-unstyled">
							<li v-for="v in a.values" :key="v.value"
								:class="{
									'text-danger': !v.loading && v.occurances < 0,
									'text-primary': v.loading,
									'text-success': v.occurances > 0,
									'text-muted': v.occurances === 0,
								}"
							>
								<strong>{{v.value}}</strong>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import { NormalizedAnnotation } from '@/types/apptypes';

import {StepState} from './POS.vue';
import { mapReduce } from '@/utils';
import { blacklab } from '@/api';

import SelectPicker from '@/components/SelectPicker.vue';


export const value = 'Generate'
export const label = value;
export const title = 'Check all combinations with BlackLab to see which occur in the corpus';

export const defaultAction = (s: StepState): StepState => { throw new Error('Cannot automatically perform ') };
export const step = Vue.extend({
	components: {
		SelectPicker
	},
	props: {
		value: Object as () => StepState
	},
	data: () => ({
		title,
		currentStep: '',


		v: {} as StepState['step3'],
		activeValue: null as null|string,
		stop: false,
		loading: true,
	}),
	computed: {
		main(): NormalizedAnnotation { return this.value.annotations.find(a => a.id === this.value.mainPosAnnotationId)!; },
		subs(): NormalizedAnnotation[] { return this.value.subAnnotations; },

		mainValues(): null|Array<{value: string, loading: boolean}> {
			return this.v.main ? Object.keys(this.v.main).map(v => ({ value: v, loading: this.v.main![v].loading})) : null
		},

		display(): null|Array<{id: string, loading: boolean, values: Array<{loading: boolean, occurances: number, value: string}>}> {
			if (!this.activeValue || !this.v.main) return null;
			const v = this.v.main[this.activeValue];


			return Object.entries(v.subs).map(([id, values]) => ({
				id,
				loading: false,
				values: Object.entries(values).map(([value, state]) => ({
					loading: state.loading,
					value,
					occurances: state.occurances,
				}))
			}));
		},
	},
	methods: {
		reset() {
			if (this.loading) {
				this.stop = true;
				return;
			};
			this.stop = false;
			this.v = {};
			this.activeValue = null;
			this.loading = true;
			this.currentStep = '';
			this.$emit('input', {...this.value, step3: this.v});
			this.getCombinations();
		},
		async getValues() {
			const numAnnotations = this.subs.length + 1;
			this.currentStep = `[0/${numAnnotations}] Getting available options for annotations...`;

			if (!this.v.main) { // skip if already loaded
				const mainPosValues = await blacklab.getTermFrequencies(this.value.index.id, this.main.id, undefined, undefined, 100);

				const values = Object.keys(mainPosValues.termFreq).filter(v => !!v.trim());
				this.$set(this.v, 'main', mapReduce(values, () => ({
					loading: true,
					subs: {}
				})));
				// update
				this.$emit('input', {...this.value, step3: this.v});
			}

			const firstValue = Object.keys(this.v.main!)[0];

			this.currentStep = `[1/${numAnnotations}] Getting available options for annotations...`;
			let i = 0;
			for (const subAnnot of this.subs) {
				// see if loaded
				if (firstValue != null && this.v.main![firstValue].subs[subAnnot.id]) {
					++i;
					continue;
				}
				const r = await blacklab.getTermFrequencies(this.value.index.id, subAnnot.id, undefined, undefined, 100);
				const subValues = Object.keys(r.termFreq).filter(v => !!v.trim())
				
				this.currentStep = `[${++i}/${numAnnotations}] Getting available options for annotations...`;

				Object.entries(this.v.main!).forEach(([mainValue, {subs}]) => this.$set(subs, subAnnot.id, mapReduce(subValues, () => ({
					loading: false,
					occurances: -1,
				}))));

				this.$emit('input', {...this.value, step3: this.v});
			}
		},
		async getCombinations() {
			await this.getValues();

			const allSubs = (Object.values(this.v.main!)[0] || {loading: false, subs: {}}).subs;
			const numSubValues = Object.values(allSubs).flatMap(s => Object.keys(s)).length;
			const numMainValues = Object.values(this.v.main!).length;

			const totalCombinations = numSubValues * numMainValues;

			// now load actual combinations
			const indexId = this.value.index.id;
			const mainPosId = this.value.mainPosAnnotationId!;
			let i = 0;
			let performedWork = false;
			for (const [mainPosValue, {subs: subAnnotations, loading: subLoading}] of Object.entries(this.v.main!)) {
				if (!subLoading) {
					i+= numSubValues;
					continue;
				}

				for (const [subAnnotationId, subAnnotationValues] of Object.entries(subAnnotations)) {
					for (const [subAnnotationValue, state] of Object.entries(subAnnotationValues)) {
						if (this.stop)
							return;
						if (state.occurances !== -1) {
							++i;
							continue;
						}

						performedWork = true;
						this.currentStep = `[${++i}/${totalCombinations}] Resolving available combinations in the corpus... ${mainPosValue} + ${subAnnotationId}=${subAnnotationValue}`;


						state.loading = true;
						const r = await blacklab.getHits(indexId, {
							number: 0,
							first: 0,
							patt: `[${mainPosId}="${mainPosValue}" & ${subAnnotationId}="${subAnnotationValue}"]`,
							maxretrieve: 1,
							maxcount: 1
						}).request;

						state.occurances = r.summary.numberOfHits;
						state.loading = false;
					}
					if (performedWork) {
						this.$emit('input', {...this.value, step3: this.v});
					}
				}
				this.v.main![mainPosValue].loading = false;
			}
			if (performedWork) {
				this.$emit('input', {...this.value, step3: this.v});
			}
			this.currentStep = 'Finished!'
			this.loading = false;
		}
	},
	created() {
		this.v = this.value.step3;
		this.getCombinations();
	},
	destroyed() {
		this.stop = true;
	}
});

export default step;

</script>