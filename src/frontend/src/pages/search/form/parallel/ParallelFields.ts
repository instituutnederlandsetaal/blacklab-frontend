import Vue from 'vue';

import * as CorpusStore from '@/store/search/corpus';
import * as PatternStore from '@/store/search/form/patterns';
import { Option } from '@/types/apptypes';

/** Helper class to factor out some repeated fields and calculations from various parts of the UI that require knowledge of parallel fields (e.g. query input form sections). */
const BaseParallelInfo = Vue.extend({
	computed: {
		isParallelCorpus: CorpusStore.get.isParallelCorpus,
		/** If this is a parallel corpus: the vailable source version options (all except current targets) */
		pSourceOptions(): Option[] {
			return CorpusStore.get.parallelAnnotatedFields()
				.filter(f => !this.pTargetValue.includes(f.id))
				.map(f => ({
					value: f.id,
					label: this.$tAnnotatedFieldDisplayName(f)
				}))
		},
		/** If this is a parallel corpus: the available target version options (all except current source and targets) */
		pTargetOptions(): Option[] {
			return this.pTargetOptionsWithCurrent.filter(o => !this.pTargetValue.includes(o.value));
		},
		/** If this is a parallel corpus: the available target version options (all except current source) */
		pTargetOptionsWithCurrent(): Option[] {
			return CorpusStore.get.parallelAnnotatedFields()
				.filter(f => f.id !== this.pSourceValue)
				.map(f => ({
					value: f.id,
					label: this.$tAnnotatedFieldDisplayName(f)
				}))
		},
		/** For rendering, contains the localized display name as label and the field's id as value. */
		pSource(): Option|undefined {
			const sourceField = CorpusStore.get.parallelAnnotatedFieldsMap()[this.pSourceValue!];
			return sourceField && {
				value: sourceField.id,
				label: this.$tAnnotatedFieldDisplayName(sourceField),
			}
		},
		/** For rendering, contains the localized display name as label and the field's id as value. */
		pTargets(): Option[] {
			const parallelFields = CorpusStore.get.parallelAnnotatedFieldsMap();
			return this.pTargetValue.map(targetFieldId => ({
				value: targetFieldId,
				label: this.$tAnnotatedFieldDisplayName(parallelFields[targetFieldId]),
			}));
		},

		/** For binding to e.g. SelectPicker v-model */
		pSourceValue: {
			get(): string|null { return PatternStore.get.parallelAnnotatedFields().source; },
			set(value: string) { PatternStore.actions.parallelFields.sourceField(value); }
		},
		/** For binding to e.g. SelectPicker v-model */
		pTargetValue: {
			get(): string[] { return PatternStore.get.parallelAnnotatedFields().targets; },
			set(value: string[]) { PatternStore.actions.parallelFields.targetFields(value); }
		}
	},
	methods: {
		addTarget(targetAnnotatedFieldId: string) {
			PatternStore.actions.parallelFields.addTarget(targetAnnotatedFieldId);
		},
		removeTarget(targetAnnotatedFieldId: string) {
			PatternStore.actions.parallelFields.removeTarget(targetAnnotatedFieldId);
		},
		setSource(sourceAnnotatedFieldId: string) {
			PatternStore.actions.parallelFields.sourceField(sourceAnnotatedFieldId);
		}
	}
})

export default BaseParallelInfo;