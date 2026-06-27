<template>
	<div class="form-group">
		<label class="col-xs-4 col-md-2" for="corpora-group-by">{{ $t('explore.corpora.groupBy') }}</label>
		<div class="col-xs-8">
			<SelectPicker
				:placeholder="`${$t('explore.corpora.groupBy')}...`"
				data-id="corpora-group-by"
				data-width="100%"
				style="max-width: 400px"
				hideEmpty
				allowHtml
				:options="metadataGroupByOptions"
				v-model="corporaGroupBy"
			/>
		</div>
	</div>
	<div class="form-group">
		<label class="col-xs-4 col-md-2" for="corpora-display-mode">{{ $t('explore.corpora.showAs.heading') }}</label>
		<div class="col-xs-8">
			<SelectPicker
				:placeholder="$t('explore.corpora.showAs.heading')"
				data-id="corpora-display-mode"
				data-width="100%"
				style="max-width: 400px"
				hideEmpty
				allowHtml
				:options="corporaGroupDisplayModeOptions"
				v-model="corporaGroupDisplayMode"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { ImplicitFieldComponentProps } from '@/features/form/model/types';

import type { ExploreCorporaFieldState, ExploreCorporaFieldUiConfig } from './explore-corpora-field';

import { useI18n } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';

import SelectPicker from '@/components/ui/SelectPicker.vue';
const props = withDefaults(defineProps<ImplicitFieldComponentProps<ExploreCorporaFieldState> & ExploreCorporaFieldUiConfig & { showLabel?: boolean }>(), {
	showLabel: true,
	disabled: false,
});

const translate = useI18n();

const emit = defineEmits<{
	(event: 'update:modelValue', value: ExploreCorporaFieldState): void;
}>();

const corporaGroupBy = computed<string | null>({
	get: () => props.modelValue.corporaGroupBy,
	set: (value: string | null) => {
		emit('update:modelValue', {
			...props.modelValue,
			corporaGroupBy: value,
		});
	},
});
const corporaGroupDisplayMode = computed<string | null>({
	get: () => props.modelValue.corporaGroupDisplayMode,
	set: (value: string | null) => {
		emit('update:modelValue', {
			...props.modelValue,
			corporaGroupDisplayMode: value,
		});
	},
});

function corporaGroupDisplayModeOptions(): Option[] {
	return [
		{
			value: 'table',
			label: translate.$t('explore.corpora.showAs.table').toString(),
		},
		{
			value: 'docs',
			label: translate.$t('explore.corpora.showAs.docs').toString(),
		},
		{
			value: 'tokens',
			label: translate.$t('explore.corpora.showAs.tokens').toString(),
		},
	];
}
</script>
