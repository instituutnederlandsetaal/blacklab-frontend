import { computed, reactive } from 'vue';

import * as CorpusStore from '@/entities/corpus/model/legacy-corpus-store';
import * as UIStore from '@/pages/search/config/ui-customization-store';
import * as PatternStore from '@/pages/search/form/store/pattern-store';

import { useI18n } from '@/shared/i18n/i18n';
import type { Option } from '@/shared/utils/options';

const useParallel = () => {
	const translate = useI18n();

	const isParallelCorpus = computed(() => CorpusStore.get.isParallelCorpus());

	/**
	 * The value of the selected source field. For binding to e.g. SelectPicker v-model
	 * If this is not a parallel corpus, returns the main annotated field.
	 */
	const sourceFieldModel = computed<string>({
		get() {
			return PatternStore.get.shared().source;
		},
		set(v: string) {
			PatternStore.actions.shared.sourceField(v);
		},
	});

	/** For value of selected target fields. For binding to e.g. SelectPicker v-model */
	const targetFieldsModel = computed<string[]>({
		get(): string[] {
			return PatternStore.get.shared().targets;
		},
		set(value: string[]) {
			PatternStore.actions.shared.targetFields(value);
		},
	});

	const alignByModel = computed<string>({
		get(): string {
			return PatternStore.get.shared().alignBy || UIStore.getState().search.shared.alignBy.defaultValue;
		},
		set(value: string) {
			PatternStore.actions.shared.alignBy(value || null);
		},
	});

	const _parallelFieldOptions = computed<Option[]>(() =>
		CorpusStore.get
			.parallelAnnotatedFields()
			.map(f => ({
				value: f.id,
				label: translate.$tAnnotatedFieldDisplayName(f),
			}))
			.sort((a, b) => a.label.localeCompare(b.label)),
	);

	/** The available source fields (all parallel fields, except currently selected target fields) */
	const sourceFieldOptions = computed(() => {
		const all = _parallelFieldOptions.value.filter(o => !targetFieldsModel.value.includes(o.value));
		const selected = all.find(o => o.value === sourceFieldModel.value);
		return {
			/** All parallel fields except the currently selected target fields */
			all,
			/** The currently selected source field */
			selected,
		};
	});
	/** The target fields as options list */
	const targetFieldOptions = computed<{ all: Option[]; selected: Option[]; unselected: Option[] }>(() => {
		const all = _parallelFieldOptions.value.filter(v => v.value !== sourceFieldModel.value);
		const selected = all.filter(o => targetFieldsModel.value.includes(o.value));
		const unselected = all.filter(o => !targetFieldsModel.value.includes(o.value));
		return {
			/** All parallel fields except the current source field */
			all,
			/** The currently selected target fields as options */
			selected,
			/** The currently unselected target fields as options */
			unselected,
		};
	});

	const alignByOptions = computed(
		() =>
			UIStore.getState().search.shared.alignBy.elements?.map(e => ({
				...e,
				label: translate.$tAlignByDisplayName(e),
			})) ?? [],
	);

	return reactive({
		isParallelCorpus,
		sourceFieldModel,
		targetFieldsModel,
		alignByModel,
		sourceFieldOptions,
		targetFieldOptions,
		alignByOptions,

		addTarget: PatternStore.actions.shared.addTarget,
		removeTarget: PatternStore.actions.shared.removeTarget,
		setSource: PatternStore.actions.shared.sourceField,
	});
};

export default useParallel;
