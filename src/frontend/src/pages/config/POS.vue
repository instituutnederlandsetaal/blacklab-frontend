<template>
	<div>
		<Steps :steps="steps" :step="step" @input="goToStep($event)"/>
		<h2 v-if="warning">{{warning}}</h2>
		<component :is="steps[step].step"
			@submit="step = steps[step+1] ? step+1 : step"

			v-model="stepstate"
		/>
		<button @click="reset">Reset</button>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { NormalizedAnnotation, NormalizedIndex, Option } from '@/types/apptypes';

import SelectPicker from '@/components/SelectPicker.vue';
import { mapReduce } from '@/utils';
import { blacklab } from '@/api';

import Steps from './Steps.vue';
import * as Step1 from './POS_1.vue';
import * as Step2 from './POS_2.vue';
import * as Step3 from './POS_3.vue';
import * as Step4 from './POS_4.vue';
import * as Step5 from './POS_5.vue';

export type StepState = {
	version: number; // only update when old version should not be assigned to new version

	annotations: NormalizedAnnotation[];
	index: NormalizedIndex;

	mainPosAnnotationId?: string; // step 1
	subAnnotations: NormalizedAnnotation[]; // step 2

	// step 3
	step3: {
		main?: {
			[value: string]: {
				loading: boolean,
				subs: {
					[sub: string]: {
						[value: string]: {
							loading: boolean;
							occurances: number;
						}
					}
				}
			}
		}
	},

	step4: {
		[annotationId: string]: {
			[value: string]: string;
		}
	}
};

const steps: Array<Option&{
	step: any,
	defaultAction: (state: any) => any,
}> = [
	Step1,
	Step2,
	Step3,
	Step4,
	Step5
]




const component = Vue.extend({
	components: {
		SelectPicker,
		Steps
	},
	props: {
		index: Object as () => NormalizedIndex
	},
	data: () => ({
		// mainPosAnnotation: null as NormalizedAnnotation|null,
		// pendingPosAnnotationId: null as string|null,

		// subAnnotationSelections: {} as Record<string, boolean>,
		// subAnnotationDetails: {} as Record<string, boolean>,
		// details: {} as Record<string, {
		// 	selected: boolean,
		// 	open: boolean,
		// 	values: null|string[]
		// }>,

		// workingOnTagset: false,

		steps,
		step: 0,
		stepstate: {
			version: 1,
			annotations: [],
			mainPosAnnotationId: undefined,
			subAnnotations: [],
			index: undefined as any, // correct on created
			step3: {},
			step4: {}
		} as StepState,

		warning: ''
	}),
	computed: {
		localStorageKey(): string { return `cf/config/${this.index.id}/stepstate`; }
		// annotations(): NormalizedAnnotation[] { return Object.values(this.index.annotatedFields).flatMap(f => Object.values(f.annotations)); },
		// annotationsMap(): Record<string, NormalizedAnnotation> { return mapReduce(this.annotations, 'id'); },
		// actualSubAnnotations(): null|string[] { return this.mainPosAnnotation ? this.mainPosAnnotation.subAnnotations || null : null; },

		// selectedSubAnnotations(): NormalizedAnnotation[] { return Object.entries(this.subAnnotationSelections).filter(([k, v]) => v).map(([k]) => this.annotationsMap[k]); },
		// deselectedSubAnnotations(): NormalizedAnnotation[] { return Object.entries(this.subAnnotationSelections).filter(([k, v]) => !v).map(([k]) => this.annotationsMap[k]); },
	},
	methods: {
		reset() {
			this.step = 0;
			this.stepstate = {
				version: 1,
				annotations: this.index.annotatedFields ? Object.values(this.index.annotatedFields).flatMap(f => Object.values(f.annotations)) : [],
				mainPosAnnotationId: undefined,
				subAnnotations: [],
				index: this.index,
				step3: {},
				step4: {}
			};
			localStorage.removeItem(this.localStorageKey);
			this.warning = '';
		},
		// log(e: any) { console.log(e); },
		goToStep(targetstep: number) {
			try {
				// on going forward: perform default action until exception thrown
				// on going backwards: should be fine!
				while (this.step < targetstep) {
					this.stepstate = this.steps[this.step].defaultAction(this.stepstate);
					++this.step;
				}

				if (this.step > targetstep)
					this.step = targetstep;
			} catch (e) {
				// nop, exception just indicates user action is required.
			}
		}
		// async createTagset() {
		// 	if (this.workingOnTagset) return;
		// 	this.workingOnTagset = true;

		// 	const mainposterms = await blacklab.getTermFrequencies(this.index.id, this.mainPosAnnotation!.id, ['.*']).then(v => Object.keys(v.termFreq));

		// 	/*
		// 	{
		// 		mainposvalue: {
		// 			subannotname: [subannotvalues];
		// 		}
		// 	}
		// 	*/
		// 	const combinations: Record<string, Record<string, string[]>> = mapReduce(mainposterms, () => ({}));
		// 	const allinterestingannotations = [this.mainPosAnnotation!, ...this.selectedSubAnnotations].map(a => `hit:${a.id}:i`).join(', ');

		// 	const usePartialStrategy = this.index.tokenCount > 100_000_000;
		// 	if (usePartialStrategy) {
		// 		throw new Error('todo this is a large corpus and we should use multiple requests');
		// 	}

		// 	const hits = await blacklab.getHits(this.index.id, {
		// 		number: Math.pow(2,31)-1,
		// 		group: allinterestingannotations,
		// 		patt: '[]',
		// 		first: 0,
		// 	});

		// 	console.log(hits);
		// }
	},
	watch: {
		stepstate() {
			localStorage.setItem(this.localStorageKey, JSON.stringify(Object.assign({}, this.stepstate, {index: {}, annotations: []})));
		}
	},
	created() {
		const savedState: null|Partial<StepState> = JSON.parse(localStorage.getItem(this.localStorageKey) || 'null');
		let valid = !!savedState;
		if (savedState) {
			const allAnnotations = Object.values(this.index.annotatedFields).flatMap(e => Object.keys(e.annotations));
			if (savedState.version !== this.stepstate.version) {
				valid = false;
			} else if (savedState.mainPosAnnotationId && !allAnnotations.includes(savedState.mainPosAnnotationId)) {
				valid = false;
			} else if (savedState.subAnnotations && !savedState.subAnnotations.every(sa => allAnnotations.includes(sa.id))) {
				valid = false;
			}
		}


		if (!valid) {
			localStorage.removeItem(this.localStorageKey);
		}

		const annotations = Object.values(this.index.annotatedFields).flatMap(f => Object.values(f.annotations));
		this.stepstate = {
			...this.stepstate,
			...(valid ? savedState : {}),
			annotations,
			index: this.index,
		}
	}
});

export default component;
export const step = component;

</script>