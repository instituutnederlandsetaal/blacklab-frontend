<template>
	<div>
		<h3>{{title}}</h3>
		<button @click="$emit('submit')" type="button">OK</button>
		<!-- main annotation values -->
		<div>
			<ul v-for="values, annotId in displays" :key="annotId" class="list-unstyled annotation-list" style="padding: 0 5px;">
				<li class="annotation-id"><strong>{{annotId}}</strong></li>
				<li v-for="display, value in values" :key="value" class="annotation-value">
					<label :for="`${annotId}-${value}`">{{value}}</label>

					<input type="text" v-model="displays[annotId][value]" :placeholder="value" style="width: 200px;" :id="`${annotId}-${value}`"
						:style="{ borderColor: (display === value) ? 'red' : undefined }"
					
					/>
				</li>
			</ul>
		</div>
		<div style="margin: 0 25px;">
			<h3>Paste a mapping object in the shape of {key: value}, or an existing tagset</h3>
			<textarea v-model="displayNamesImport" placeholder="Paste a mapping object in the shape of {key: value}" style="width: 100%;"></textarea>
			<button :disabled="!importValueAsJson" type="button" @click="importDisplayNames">Import display names</button>
		</div>
	</div>
</template>

<script lang="ts">
import { mapReduce } from '@/utils';
import cloneDeep from 'clone-deep';
import Vue from 'vue';

import {StepState} from './POS.vue';
import { Tagset } from '@/types/apptypes';

export const value = 'Edit'
export const label = value;
export const title = 'Validate and add display values';
export const defaultAction = (s: StepState): StepState => s;


function getDisplayNamesFromTagset(t: Tagset, mainAnnotationId: string): Record<string, Record<string, string>> {
	const r: Record<string, Record<string, string>> = {};
	r[mainAnnotationId] = {}
	Object.values(t.values).forEach(({value, displayName}) => {
		r[mainAnnotationId][value] = displayName || value;
	});
	Object.values(t.subAnnotations).forEach(sub => {
		r[sub.id] = {};
		sub.values.forEach(({value, displayName}) => {
			r[sub.id][value] = displayName || value;
		});
	});
	return r;
}


export const step = Vue.extend({
	props: {
		value: Object as () => StepState
	},
	data: () => ({
		title,
		/** Content of the pasted displayNames object. */
		displayNamesImport: '',

		displays: {} as {
			[annotationId: string]: {
				[value: string]: string
			}
		}
	}),
	computed: {
		importValueAsJson(): undefined|Record<string, any> {
			if (!this.displayNamesImport) return undefined;
			try {
				const t = JSON.parse(this.displayNamesImport);
				if (typeof t === 'object' && t != null) return t;
			} catch { return undefined; }
		},
		importValueAsTagset(): Tagset|undefined {
			const t = this.importValueAsJson;
			if (!t) return undefined;
			if ('values' in t && 'subAnnotations' in t) return t as Tagset;
			return undefined;
		},
		importValueAsRecord(): Record<string, string>|undefined {
			const t = this.importValueAsJson;
			if (!t) return undefined;
			if (typeof t === 'object' && t != null && Object.values(t).every(v => typeof v === 'string')) return t as Record<string, string>;
			return undefined;
		},

		decodedDisplayNames(): Record<string, Record<string, string>>|{default: Record<string, string>} {
			if (this.importValueAsTagset) return getDisplayNamesFromTagset(this.importValueAsTagset, this.value.mainPosAnnotationId!);
			else if (this.importValueAsRecord) return {default: this.importValueAsRecord };
			else return {};
		},
	},
	methods: {
		importDisplayNames() {
			Object.keys(this.displays).forEach(annotId => {
				// @ts-expect-error types don't overlap in a useful way.
				const displayNamesForAnnot = this.decodedDisplayNames[annotId] || this.decodedDisplayNames.default;
				if (!displayNamesForAnnot) {
					console.warn(`No displayNames found for annotation ${annotId} in imported data`);
					return;
				}
				// Update the display names for the current annotation ID
				Object.entries(displayNamesForAnnot).forEach(([value, displayName]) => {
					this.$set(this.displays[annotId], value, displayName);
				});
			});
		}
	},
	created() {
		this.displays = cloneDeep(this.value.step4);

		const mainValues = Object.keys(this.value.step3.main!)
		const mainId = this.value.mainPosAnnotationId!;
		this.$set(this.displays, mainId, this.displays[mainId] || mapReduce(mainValues, v => v));

		const subs = Object.values(this.value.step3.main!)[0].subs;

		// now create all missing entries
		Object.entries(subs)
		.forEach(([subId, subValues]) => {
			this.$set(this.displays, subId, this.displays.subId || {});
			Object.entries(subValues).forEach(([value, {occurances}]) => {
				this.$set(this.displays[subId], value, this.displays[subId][value] || value);
			});
		});
	},
	watch: {
		displays: {
			deep: true,
			handler() {
				this.$emit('input', {...this.value, step4: this.displays});
			}
		}
	}
});

export default step;

</script>

<style lang="scss">

.annotation-list {
	display: inline-grid;
	gap: 0.5em;
	grid-template-columns: auto auto;
}
.annotation-id {
	grid-column: 1 / -1;
}
.annotation-value {
	display: contents;
}
</style>