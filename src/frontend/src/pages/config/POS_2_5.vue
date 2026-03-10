<template>
	<div>
		<h3>{{title}}</h3>
		<p class="text-muted">
			Add exclusion criteria to filter out tokens that shouldn't be included in the tagset generation.
			For example, tokens with <code>isclitic="true"</code> that might contain mixed lemma/POS information.
		</p>

		<div v-for="(exclusion, index) in localExclusions" :key="index" class="panel panel-default" style="margin-bottom: 10px;">
			<div class="panel-body">
				<div style="display: flex; gap: 10px; width: 100%; align-items: flex-start;">
					<div style="display: flex; flex-direction: column; flex-grow: 0;">
						<label>Annotation</label>
						<SelectPicker
							:options="annotationOptions"
							:value="exclusion.annotationId"
							allowHtml
							@input="updateExclusion(index, 'annotationId', $event)"
							placeholder="Select annotation to exclude"
							searchable
						/>
					</div>
					<div style="display: flex; flex-direction: column; flex-grow: 0;">
						<label>Values to exclude</label>
						<SelectPicker
							:options="getValuesForAnnotation(exclusion.annotationId)"
							:value="exclusion.values"
							@input="updateExclusion(index, 'values', $event)"
							placeholder="Select values"
							multiple
							searchable
							:disabled="!exclusion.annotationId"
						/>
					</div>
					<div style="align-self: flex-end;">
						<button type="button" class="btn btn-danger" @click="removeExclusion(index)">
							<span class="fa fa-trash"></span>
						</button>
					</div>
				</div>
			</div>
		</div>

		<button type="button" class="btn btn-default" @click="addExclusion">
			<span class="fa fa-plus"></span> Add exclusion
		</button>

		<div v-if="localExclusions.some(e => e.annotationId && e.values.length)" style="margin-top: 20px;" class="panel panel-info">
			<div class="panel-heading">Query clause that will be added</div>
			<div class="panel-body">
				<code>{{queryClause}}</code>
			</div>
		</div>

		<div style="margin-top: 20px;">
			<button type="button" class="btn btn-primary" @click="submit">OK</button>
			<button type="button" class="btn btn-default" @click="skip">Skip (no exclusions)</button>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { NormalizedAnnotation, Option } from '@/types/apptypes';
import SelectPicker from '@/components/SelectPicker.vue';
import { StepState, ExclusionRule } from './POS.vue';
import { blacklab } from '@/api';

export const value = 'Exclusions';
export const label = value;
export const title = 'Configure exclusion rules (optional)';

export const defaultAction = (s: StepState): StepState => {
	// No validation needed, exclusions are optional
	return s;
};

export const step = Vue.extend({
	components: { SelectPicker },
	props: {
		value: Object as () => StepState
	},
	data: () => ({
		title,
		localExclusions: [] as ExclusionRule[],
		annotationValues: {} as Record<string, Array<{ value: string, label: string }>>,
		loadingValues: {} as Record<string, boolean>
	}),
	computed: {
		annotationOptions(): Option[] {
			return this.value.annotations.map(a => ({
				value: a.id,
				label: `${a.id} <small class="text-muted">${a.defaultDisplayName}</small>`,
			}));
		},
		queryClause(): string {
			if (this.localExclusions.length === 0) return '';

			const clauses = this.localExclusions
				.filter(e => e.annotationId && e.values.length > 0)
				.map(e => {
					if (e.values.length === 1) {
						return `${e.annotationId}!="${e.values[0]}"`;
					} else {
						return `${e.annotationId}!="${e.values.join('|')}"`;
					}
				});

			return clauses.length > 0 ? `& ${clauses.join(' & ')}` : '';
		}
	},
	methods: {
		addExclusion() {
			this.localExclusions.push({
				annotationId: '',
				values: []
			});
		},
		removeExclusion(index: number) {
			this.localExclusions.splice(index, 1);
		},
		updateExclusion(index: number, field: keyof ExclusionRule, value: any) {
			const exclusion = this.localExclusions[index];
			if (field === 'annotationId') {
				exclusion.annotationId = value;
				exclusion.values = []; // Reset values when annotation changes
				this.loadValuesForAnnotation(value);
			} else if (field === 'values') {
				exclusion.values = Array.isArray(value) ? value : [value];
			}
			this.$set(this.localExclusions, index, exclusion);
		},
		async loadValuesForAnnotation(annotationId: string) {
			if (!annotationId || this.annotationValues[annotationId] || this.loadingValues[annotationId]) {
				return;
			}

			this.$set(this.loadingValues, annotationId, true);

			try {
				const result = await blacklab.getTermFrequencies(
					this.value.index.id,
					annotationId,
					undefined,
					undefined,
					100
				);

				const values = Object.keys(result.termFreq)
					.filter(v => !!v.trim())
					.sort()
					.map(v => ({
						value: v,
						label: v
					}));

				this.$set(this.annotationValues, annotationId, values);
			} catch (error) {
				console.error(`Failed to load values for ${annotationId}:`, error);
				this.$set(this.annotationValues, annotationId, []);
			} finally {
				this.$set(this.loadingValues, annotationId, false);
			}
		},
		getValuesForAnnotation(annotationId: string): Option[] {
			if (!annotationId) return [];

			if (!this.annotationValues[annotationId]) {
				this.loadValuesForAnnotation(annotationId);
				return this.loadingValues[annotationId]
					? [{ value: '', label: 'Loading...', disabled: true }]
					: [];
			}

			return this.annotationValues[annotationId];
		},
		submit() {
			const validExclusions = this.localExclusions.filter(
				e => e.annotationId && e.values.length > 0
			);
			this.$emit('input', {
				...this.value,
				exclusions: validExclusions
			});
			this.$emit('submit');
		},
		skip() {
			this.$emit('input', {
				...this.value,
				exclusions: []
			});
			this.$emit('submit');
		}
	},
	created() {
		// Initialize from saved state if available
		if (this.value.exclusions && this.value.exclusions.length > 0) {
			this.localExclusions = JSON.parse(JSON.stringify(this.value.exclusions));
			// Preload values for existing exclusions
			this.localExclusions.forEach(e => {
				if (e.annotationId) {
					this.loadValuesForAnnotation(e.annotationId);
				}
			});
		}
	}
});

export default step;
</script>
