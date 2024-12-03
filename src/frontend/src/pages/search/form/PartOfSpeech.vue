<template>
	<Modal v-if="open" :title="$tAnnotDisplayName(annotation)" :confirmMessage="$t('partOfSpeech.submit')" @confirm="submit(); $emit('close');" lg :close="false">
		<template v-if="isValidTagset">

			<div class="list-group-container" >
				<div class="list-group main">
					<button v-for="value in tagset.values"
						type="button"
						:key="value.value"
						:class="{
							'list-group-item': true,
							'active': annotationValue === value
						}"

						@click="annotationValue = (annotationValue === value ? null : value)"
					>
						{{value.displayName}} <Debug>({{value.value}})</Debug>
					</button>
				</div>

				<div v-if="annotationValue" class="category-container">
					<ul v-for="subId in annotationValue.subAnnotationIds" class="list-group category">
						<li class="list-group-item active category-name">
							{{$tAnnotDisplayName(allAnnotations[subId])}}
							<Debug>({{subId}})</Debug>
						</li>

						<li class="list-group-item category-value" v-for="subValue in tagset.subAnnotations[subId].values" :key="subValue.value" v-if="!subValue.pos || subValue.pos.includes(annotationValue.value)">
							<label>
								<input type="checkbox" v-model="selected[`${annotationValue.value}/${subId}/${subValue.value}`]"/>
								{{subValue.displayName}}
								<Debug>({{subValue.value}})</Debug>
							</label>
						</li>
					</ul>
					<em v-if="annotationValue.subAnnotationIds.length === 0">{{$t('partOfSpeech.noOptions')}}</em>
				</div>
			</div>
			<template v-if="query">
				<hr>
				<div>{{query}}</div>
			</template>
		</template>
		<div v-else class="alert alert-danger">
			{{errorMessage}}
		</div>


		<template #footer>
			<button type="button" class="btn btn-default" @click="reset">{{$t('partOfSpeech.reset')}}</button>
		</template>
	</Modal>
</template>

<script lang="ts">
import Vue from 'vue';
import * as TagsetStore from '@/store/search/tagset';
import * as CorpusStore from '@/store/search/corpus';

import { Tagset } from '@/types/apptypes';
import { escapeRegex } from '@/utils';

import Modal from '@/components/Modal.vue';

export default Vue.extend({
	components: {
		Modal,
	},
	props: {
		annotation: Object as () => CorpusStore.NormalizedAnnotation,
		open: { default: true }
	},
	data: () => ({
		annotationValue: null as null|Tagset['values'][string],
		selected: {} as {[key: string]: boolean}
	}),
	computed: {
		allAnnotations: CorpusStore.get.allAnnotationsMap,
		tagset: TagsetStore.getState,
		isValidTagset(): boolean { return TagsetStore.getState().state === 'loaded'; },
		errorMessage(): string { return this.isValidTagset ? '' : TagsetStore.getState().message; },
		query(): string {
			if (this.annotationValue == null) { return ''; }

			return [
				`${this.annotation.id}="${escapeRegex(this.annotationValue.value)}"`,
				...this.annotationValue.subAnnotationIds.map(subAnnot => {
					const {values} = this.tagset.subAnnotations[subAnnot];
					const selected = values.filter(v => this.selected[`${this.annotationValue!.value}/${subAnnot}/${v.value}`]);

					return {subAnnot, escapedValues: selected.map(v => escapeRegex(v.value))};
				})
				.filter(({escapedValues}) => escapedValues.length > 0)
				.map(({subAnnot, escapedValues}) => `${subAnnot}="${escapedValues.join('|')}"`)
			].join('&');
		},
	},
	methods: {
		reset() {
			Object.keys(this.selected).forEach(k => this.selected[k] = false);
			this.annotationValue = null;
		},
		submit() {
			this.$emit('submit', this.query);
		}
	},
	created() {
		Object.values(this.tagset.values).forEach(value => {
			value.subAnnotationIds.forEach(annotId => {
				const {values, id} = this.tagset.subAnnotations[annotId];
				values.forEach(({value: subAnnotValue}) => {
					Vue.set(this.selected, `${value.value}/${annotId}/${subAnnotValue}`, false);
				});
			});
		});
	}
});
</script>

<style lang="scss" scoped>

.list-group-container {
	display: flex;
	flex-wrap: nowrap;

	> .list-group.main,
	> .category-container {
		max-height: calc(100vh - 305px);
		min-height: 200px;
		overflow: auto;
	}
}

.category-container {
	overflow: auto;
	flex-grow: 1;
	display: flex;
	flex-wrap: wrap;

	.list-group {
		margin-right: 12px;
		min-width: 120px;
		>.list-group-item {
			padding: 6px 10px;
		}
	}
}

.list-group {
	padding: 0;

	&.main {
		display: inline-block;
		flex: none;
		flex-basis: auto;
		margin: 0 20px 0 0;
	}

	&.category {
		display: inline-block;
		vertical-align: top;
		white-space: nowrap;
		flex: none;

		label {
			margin: 0;
			padding: 0;
		}
	}
}

</style>