<template>
	<div>
		<h3>{{title}}</h3>
		<button type="button" class="btn btn-primary" @click="$emit('submit')" :disabled="!value.subAnnotations">OK</button>
		<button type="button" class="btn btn-default" title="select subannotations of the main annotation" :disabled="defaultSubAnnotations.length === 0" @click="$emit('input', {...value, subAnnotations: defaultSubAnnotations})">select defaults</button>
		<div style="display:flex; gap: 15px; padding: 10px 0; align-items: flex-start; width: 100%;">
			<div class="unpicked" style="display: inline-flex; flex-direction: column; gap: 2px;">
				<h3>Selected</h3>
				<button v-for="a in value.subAnnotations" :key="a.id"
					type="button"
					class="btn btn-default"
					style="text-align: right; display: flex; gap: 0.25em; align-items: baseline;"
					@click="$emit('input', {...value, subAnnotations: value.subAnnotations.filter(sa => sa != a)})"
				>
					<small v-if="a.defaultDisplayName !== a.id" class="text-muted">{{a.defaultDisplayName}}</small>
					<span style="flex-basis: 100%;">{{a.id}}</span>
					<span class="fa fa-arrow-right"></span>
				</button>

			</div>

			<div class="unpicked" style="display: inline-flex; flex-direction: column; gap: 2px;">
				<h3>Available</h3>
				<button v-for="a in unpickedSubAnnotations"
					:key="a.id"
					type="button"
					class="btn btn-default"
					style="text-align: left;  display: flex; gap: 0.25em; align-items: baseline;"
					@click="$emit('input', {...value, subAnnotations: value.subAnnotations.concat(a)})"
				>
					<span class="fa fa-arrow-left"></span>
					<span style="flex-basis: 100%;">{{a.id}}</span>
					<small v-if="a.defaultDisplayName !== a.id" class="text-muted">{{a.defaultDisplayName}}</small>
				</button>
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

// export const canActivate = () => true;
export const defaultAction = (s: StepState): StepState => ({
	...s,
	subAnnotations: s.annotations.filter(a => a.parentAnnotationId === s.mainPosAnnotationId)
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
			const picked = new Set(this.value.subAnnotations.map(a => a.id));

			return this.value.annotations.filter(a => a.id !== this.value.mainPosAnnotationId && !picked.has(a.id));
		}
	},
	created() {
		// validate that main annotation is not in list of sub annotations (may have been changed)

	}
});

export default step;

</script>