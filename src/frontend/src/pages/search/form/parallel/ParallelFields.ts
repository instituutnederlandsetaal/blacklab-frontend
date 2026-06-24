import { defineComponent } from 'vue';

import { useCorpus } from '@/app/state/useCorpusContext';
import * as PatternStore from '@/features/search/model/form/pattern-state';

import type { Option } from '@/shared/utils/options';

/** Helper class to factor out some repeated fields and calculations from various parts of the UI that require knowledge of parallel fields (e.g. query input form sections). */
const BaseParallelInfo = defineComponent({
	computed: {
		isParallelCorpus() {
			return useCorpus().value.isParallelCorpus;
		},
		/** If this is a parallel corpus: the vailable source version options (all except current targets) */
		pSourceOptions(): Option[] {
			const opt = useCorpus()
				.value.parallelAnnotatedFields.filter(f => !this.pTargetValue.includes(f.id))
				.map(f => ({
					value: f.id,
					label: this.$tAnnotatedFieldDisplayName(f),
				}));
			return opt.sort((a, b) => a.label.localeCompare(b.label));
		},
		/** If this is a parallel corpus: the available target version options (all except current source and targets) */
		pTargetOptions(): Option[] {
			return this.pTargetOptionsWithCurrent.filter(o => !this.pTargetValue.includes(o.value));
		},
		/** If this is a parallel corpus: the available target version options (all except current source) */
		pTargetOptionsWithCurrent(): Option[] {
			const opt = useCorpus()
				.value.parallelAnnotatedFields.filter(f => f.id !== this.pSourceValue)
				.map(f => ({
					value: f.id,
					label: this.$tAnnotatedFieldDisplayName(f),
				}));
			return opt.sort((a, b) => a.label.localeCompare(b.label));
		},
		/** For rendering, contains the localized display name as label and the field's id as value. */
		pSource(): Option | undefined {
			const sourceField = useCorpus().value.parallelAnnotatedFieldsMap[this.pSourceValue!];
			return (
				sourceField && {
					value: sourceField.id,
					label: this.$tAnnotatedFieldDisplayName(sourceField),
				}
			);
		},
		/** For rendering, contains the localized display name as label and the field's id as value. */
		pTargets(): Option[] {
			const parallelFields = useCorpus().value.parallelAnnotatedFieldsMap;
			return this.pTargetValue.map(targetFieldId => ({
				value: targetFieldId,
				label: this.$tAnnotatedFieldDisplayName(parallelFields[targetFieldId]),
			}));
		},

		/** For binding to e.g. SelectPicker v-model */
		pSourceValue: {
			get(): string | null {
				return PatternStore.get.shared().source;
			},
			set(value: string) {
				PatternStore.actions.shared.sourceField(value);
			},
		},
		/** For binding to e.g. SelectPicker v-model */
		pTargetValue: {
			get(): string[] {
				return PatternStore.get.shared().targets;
			},
			set(value: string[]) {
				PatternStore.actions.shared.targetFields(value);
			},
		},
	},
	methods: {
		addTarget(targetAnnotatedFieldId: string) {
			PatternStore.actions.shared.addTarget(targetAnnotatedFieldId);
		},
		removeTarget(targetAnnotatedFieldId: string) {
			PatternStore.actions.shared.removeTarget(targetAnnotatedFieldId);
		},
		setSource(sourceAnnotatedFieldId: string) {
			PatternStore.actions.shared.sourceField(sourceAnnotatedFieldId);
		},
	},
});

export default BaseParallelInfo;
