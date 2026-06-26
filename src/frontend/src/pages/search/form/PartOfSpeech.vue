<template>
	<Modal
		v-if="open"
		:title="$tAnnotDisplayName(annotation)"
		:confirmMessage="$t('partOfSpeech.submit')"
		@confirm="
			submit();
			$emit('close');
		"
		lg
		:close="false"
	>
		<div v-if="!tagset" class="alert alert-warning">
			<!-- TODO i18n -->
			No tagset
		</div>
		<template v-else>
			<div class="list-group-container">
				<div class="list-group main">
					<button
						v-for="value in tagset.values"
						type="button"
						:key="value.value"
						:class="{
							'list-group-item': true,
							active: annotationValue === value,
						}"
						@click="annotationValue = annotationValue === value ? null : value"
					>
						{{ value.displayName }} <Debug>({{ value.value }})</Debug>
					</button>
				</div>

				<div v-if="annotationValue" class="category-container">
					<ul v-for="subId in annotationValue.subAnnotationIds" :key="subId" class="list-group category">
						<li class="list-group-item active category-name">
							{{ $tAnnotDisplayName(allAnnotations[subId]) }}
							<Debug>({{ subId }})</Debug>
						</li>

						<li class="list-group-item category-value" v-for="subValue in visibleSubAnnotationValues(subId)" :key="subValue.value">
							<label>
								<input type="checkbox" v-model="selected[`${annotationValue.value}/${subId}/${subValue.value}`]" />
								{{ subValue.displayName }}
								<Debug>({{ subValue.value }})</Debug>
							</label>
						</li>
					</ul>
					<em v-if="annotationValue.subAnnotationIds.length === 0">{{ $t('partOfSpeech.noOptions') }}</em>
				</div>
			</div>
			<template v-if="query">
				<hr />
				<div>{{ query }}</div>
			</template>
		</template>

		<template #footer>
			<button type="button" class="btn btn-default" @click="reset">{{ $t('partOfSpeech.reset') }}</button>
		</template>
	</Modal>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

import { useCorpus } from '@/app/state/useCorpusContext';
import * as TagsetStore from '@/features/corpus/model/tagset-state';
import type { NormalizedAnnotation, Tagset } from '@/types/apptypes';

import { escapeRegex } from '@/shared/utils/string-utils';

import Modal from '@/shared/ui/Modal.vue';

export default defineComponent({
	components: {
		Modal,
	},
	emits: ['close', 'submit'],
	props: {
		annotation: { type: Object as PropType<NormalizedAnnotation>, required: true },
		open: { type: Boolean, default: true },
	},
	data: () => ({
		annotationValue: null as null | Tagset['values'][string],
		selected: {} as { [key: string]: boolean },
	}),
	computed: {
		allAnnotations() {
			return useCorpus().value.allAnnotationsMap;
		},
		tagset: TagsetStore.getState,
		query(): string {
			if (!this.tagset || !this.annotationValue) return '';
			const tagset: Tagset = this.tagset;
			return [
				`${this.annotation.id}="${escapeRegex(this.annotationValue.value)}"`,
				...this.annotationValue.subAnnotationIds
					.map(subAnnot => {
						const values = tagset.subAnnotations[subAnnot]?.values || [];
						const selected = values.filter(v => this.selected[`${this.annotationValue!.value}/${subAnnot}/${v.value}`]);

						return { subAnnot, escapedValues: selected.map(v => escapeRegex(v.value)) };
					})
					.filter(({ escapedValues }) => escapedValues.length > 0)
					.map(({ subAnnot, escapedValues }) => `${subAnnot}="${escapedValues.join('|')}"`),
			].join('&');
		},
	},
	methods: {
		visibleSubAnnotationValues(subId: string) {
			if (!this.tagset || !this.annotationValue) {
				return [] as Tagset['subAnnotations'][string]['values'];
			}
			const subAnnotation = this.tagset.subAnnotations[subId];
			if (!subAnnotation) {
				return [] as Tagset['subAnnotations'][string]['values'];
			}
			return subAnnotation.values.filter(subValue => !subValue.pos || subValue.pos.includes(this.annotationValue!.value));
		},
		reset() {
			Object.keys(this.selected).forEach(k => (this.selected[k] = false));
			this.annotationValue = null;
		},
		submit() {
			this.$emit('submit', this.query);
		},
	},
	watch: {
		tagset: {
			handler(t: Tagset | undefined) {
				if (!t) return;
				Object.values(t.values).forEach(value => {
					value.subAnnotationIds.forEach(annotId => {
						const values = t.subAnnotations[annotId]?.values || [];
						values.forEach(({ value: subAnnotValue }) => {
							this.selected[`${value.value}/${annotId}/${subAnnotValue}`] = false;
						});
					});
				});
			},
			immediate: true,
		},
	},
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
		> .list-group-item {
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
