<template>
	<Component :is="filterComponent" v-bind="filterComponentProps" v-model="modelValue" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { BaseFilterProps } from '@/features/form/fields/filters/FilterBase';
import type { MetadataFilterFieldConfig, MetadataFilterFieldState } from '@/features/form/model/controllers/metadata-filter-controller';
import type { FormFieldNode } from '@/features/form/model/types/form-shape';

import useUid from '@/shared/utils/useUid';

import FilterAutocomplete from './filters/FilterAutocomplete.vue';
import FilterCheckbox from './filters/FilterCheckbox.vue';
import FilterDate from './filters/FilterDate.vue';
import FilterRadio from './filters/FilterRadio.vue';
import FilterRange from './filters/FilterRange.vue';
import FilterRangeMultipleFields from './filters/FilterRangeMultipleFields.vue';
import FilterSelect from './filters/FilterSelect.vue';
import FilterText from './filters/FilterText.vue';

const props = defineProps<{
	node: FormFieldNode<MetadataFilterFieldConfig>;
}>();

const modelValue = defineModel<MetadataFilterFieldState>('state', { required: true });

// TODO these should not be decided here, but be contained in the different controller instances
// Some controllers can be shared between identical-ish UI, as their state is identical
// select, checkbox, radio (all lists of literals, just with a single/multiple switch)
// text and autocomplete
// date and multi-field date
// range and multi-field range
const components = {
	'filter-autocomplete': FilterAutocomplete,
	'filter-checkbox': FilterCheckbox,
	'filter-date': FilterDate,
	'filter-radio': FilterRadio,
	'filter-range': FilterRange,
	'filter-range-multiple-fields': FilterRangeMultipleFields,
	'filter-select': FilterSelect,
	'filter-text': FilterText,
};

const uid = useUid();

const node = computed(() => props.node);
const config = computed(() => props.node.config);
const filterComponentProps = computed<BaseFilterProps<any, any>>(() => ({
	definition: config.value,
	modelValue: modelValue.value,
	textDirection: config.value.textDirection || 'ltr',
	htmlId: `${node.value.id}-${uid}`,
	showLabel: true, // todo??
}));

const filterComponent = computed(() => components[config.value.componentName as keyof typeof components] ?? FilterText);
</script>
