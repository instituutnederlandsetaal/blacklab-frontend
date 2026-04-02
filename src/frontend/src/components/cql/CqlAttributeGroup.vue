<template>
	<div class="bl-token-attribute-group" :class="{ well: !isRoot }" :id="model.id">
		<!-- Mixed Entries with Operators -->
		<template v-for="(entry, index) in model.entries" class="bl-attribute-entry-wrapper">
			<!-- Operator Label (shown before each entry except the first one) -->
			<div v-if="index > 0"
				:key="`operator-${entry.id}`"
				class="bl-token-attribute-group-label"
			>
				{{ currentOperatorOption.label }}
			</div>

			<!-- Attribute Entry -->
			<CqlAttribute
				v-if="isCqlAttributeData(entry)"
				:key="`attr-${entry.id}`"
				:options="options"
				:model-value="entry"
				@update:model-value="updateAttributeAtIndex(index, $event)"
				@add-attribute-group="addAttribute($event as CqlAnnotationCombinator, entry)"
				@delete-attribute="deleteAttribute(entry.id)"
			/>

			<!-- Nested Attribute Group -->
			<CqlAttributeGroup
				v-else-if="isCqlAttributeGroupData(entry)"
				:key="`group-${entry.id}`"
				:is-root="false"
				:options="options"
				@delete-group="deleteNestedGroup"
				:model-value="entry"
				@update:model-value="updateGroupAtIndex(index, $event)"
			/>
		</template>

		<!-- Add Controls -->
		<CqlAddAttributeButton v-if="shouldShowAddControls" @click="addAttribute($event)" :options="options"/>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useVModel } from '@vueuse/core';
import { Option } from '@/types/apptypes';
import {
	CqlAttributeGroupData,
	CqlAttributeData,
	CqlGroupEntry,
	CqlQueryBuilderOptions,
	isCqlAttributeData,
	isCqlAttributeGroupData,
	CqlAnnotationCombinator,
} from '@/components/cql/cql-types';
import CqlAttribute from './CqlAttribute.vue';
import CqlAddAttributeButton from './CqlAddAttributeButton.vue';
import uid from '@/mixins/uid';

defineOptions({ name: 'CqlAttributeGroup' });

const props = withDefaults(defineProps<{
	isRoot?: boolean,
	options: CqlQueryBuilderOptions,
	modelValue: CqlAttributeGroupData,
}>(), {
	isRoot: false,
});

const emit = defineEmits<{
	'update:modelValue': [value: CqlAttributeGroupData],
	'delete-group': [groupId: string, replaceWith?: CqlGroupEntry],
}>();

const model = useVModel(props, 'modelValue', emit, {
	deep: true,
	passive: true,
	clone: true,
});

const shouldShowAddControls = computed(() => props.isRoot || model.value.entries.length > 0);
const currentOperatorOption = computed<Option>(() => {
	return props.options.operatorOptions.find(op => op.value === model.value.operator) || {
		value: model.value.operator,
		label: model.value.operator,
	};
});

function createDefaultAttribute(): CqlAttributeData {
	return {
		id: `attr_${uid()}`,
		annotationId: props.options.defaultAnnotationId,
		comparator: '=',
		values: [''],
		caseSensitive: false,
	};
}

function addAttribute(operator: CqlAnnotationCombinator, calledForAttribute?: CqlAttributeData) {
	// Optimization: if there is only one attribute, keep a flat group by switching operator.
	if (model.value.entries.length <= 1) {
		model.value.operator = operator;
	}

	if (operator === model.value.operator) {
		const index = calledForAttribute
			? model.value.entries.findIndex(e => e.id === calledForAttribute.id) + 1
			: model.value.entries.length;
		model.value.entries.splice(index, 0, createDefaultAttribute());
		return;
	}

	if (calledForAttribute) {
		const newGroup: CqlAttributeGroupData = {
			id: `group_${uid()}`,
			operator,
			entries: [calledForAttribute, createDefaultAttribute()],
		};
		const index = model.value.entries.findIndex((entry: CqlGroupEntry) => entry.id === calledForAttribute.id);
		model.value.entries.splice(index, 1, newGroup);
		return;
	}

	const previousGroup = model.value;
	model.value = {
		id: `group_${uid()}`,
		operator,
		entries: [previousGroup, createDefaultAttribute()],
	};
}

function deleteAttribute(attributeId: string) {
	const index = model.value.entries.findIndex((entry: CqlGroupEntry) =>
		isCqlAttributeData(entry) && entry.id === attributeId);
	if (index !== -1) {
		model.value.entries.splice(index, 1);
		checkIfShouldRemoveSingleEntryGroup();
	}
}

function updateAttributeAtIndex(index: number, updatedAttribute: CqlAttributeData) {
	if (index >= 0 && index < model.value.entries.length) {
		model.value.entries.splice(index, 1, updatedAttribute);
	}
}

function updateGroupAtIndex(index: number, updatedGroup: CqlAttributeGroupData) {
	if (index >= 0 && index < model.value.entries.length) {
		model.value.entries.splice(index, 1, updatedGroup);
	}
}

function deleteNestedGroup(groupId: string, replaceWith?: CqlGroupEntry) {
	const index = model.value.entries.findIndex((entry: CqlGroupEntry) =>
		isCqlAttributeGroupData(entry) && entry.id === groupId);
	if (index !== -1) {
		if (replaceWith) {
			model.value.entries.splice(index, 1, replaceWith);
		} else {
			model.value.entries.splice(index, 1);
		}
		checkIfShouldRemoveSingleEntryGroup();
	}
}

function checkIfShouldRemoveSingleEntryGroup() {
	if (!props.isRoot && model.value.entries.length <= 1) {
		emit('delete-group', model.value.id, model.value.entries[0]);
	}
}
</script>

<style lang="scss">

.bl-token-attribute-group {
	padding: 0px;
	/* 	No margin-top here, as the topmost group does not require spacing above it
		Spacing is instead done in all subgroups, which also have the well class */
	display: flex;
	flex-direction: column;
	gap: 8px;

	&.well {
		padding: 8px;
		margin: 0;
		box-shadow: 4px 4px 7px -3px rgba(0,0,0,0.38);
		border: 1px solid rgba(0,0,0,0.15);
	}
}



.bl-create-attribute-dropdown {
	align-self: center;
}

</style>