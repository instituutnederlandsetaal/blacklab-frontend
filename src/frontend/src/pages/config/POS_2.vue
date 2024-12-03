<template>
	<div>
		<h3>{{title}}</h3>
		<button type="button" @click="$emit('submit')" :disabled="!value.subAnnotations">OK</button>
		<button type="button" title="select subannotations of the main annotation" :disabled="defaultSubAnnotations.length === 0" @click="$emit('input', {...value, subAnnotations: defaultSubAnnotations})">select defaults</button>
		<div style="display:flex">
			<div style="width: auto; max-width: 50%; padding: 10px 15px; min-width: 200px;">
				<ul class="list-unstyled">
					<li v-for="a in value.subAnnotations" style="display:flex;" :key="a.id">
						<span style="display: inline-block; flex-grow: 1;">
							{{a.id}}
							<small class="text-muted">{{a.defaultDisplayName}}</small>
						</span>
						{{' '}}
						<button type="button" style="flex: 0;"
							@click="$emit('input', {...value, subAnnotations: value.subAnnotations.filter(sa => sa != a)})"
						><span class="fa fa-arrow-right"></span></button>
					</li>
				</ul>

			</div>

			<div style="width: auto; max-width: 50%; padding: 10px 15px; min-width: 200px;">
				<ul class="list-unstyled">
					<li v-for="a in unpickedSubAnnotations" style="display:flex;" :key="a.id">
						<button type="button" style="flex: 0;"
							@click="$emit('input', {...value, subAnnotations: value.subAnnotations.concat(a)})"
						><span class="fa fa-arrow-left"></span></button>
						{{' '}}
						<span style="display: inline-block; flex-grow: 1;">
							{{a.id}}
							<small class="text-muted">{{a.defaultDisplayName}}</small>
						</span>
					</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';

import { NormalizedAnnotation } from '@/types/apptypes';

import {StepState} from './POS.vue';


export const value = 'Choose sub'
export const label = value;
export const title = 'Select Part of Speech sub annotations';


import {filterDuplicates} from '@/utils';

// export const canActivate = () => true;
export const defaultAction = (s: StepState): StepState => ({
	...s,
	subAnnotations: s.annotations.filter(a => a.parentAnnotationId === s.mainPosAnnotationId)
});
export const lastStepChanged = (s: StepState): StepState => ({
	...s,
	subAnnotations: s.subAnnotations.filter(sub => sub.id !== s.mainPosAnnotationId)
});
export const step = Vue.extend({
	props: {
		value: Object as () => StepState
	},
	data: () => ({
		title,

	}),
	computed: {
		defaultSubAnnotations(): NormalizedAnnotation[] { return this.value.annotations.filter(a => a.parentAnnotationId === this.value.mainPosAnnotationId); },
		unpickedSubAnnotations(): NormalizedAnnotation[] {
			const picked = new Set(this.value.subAnnotations);

			return this.value.annotations.filter(a => a.id !== this.value.mainPosAnnotationId && !picked.has(a));
		}
	},
	created() {
		// validate that main annotation is not in list of sub annotations (may have been changed)

	}
});

export default step;

</script>