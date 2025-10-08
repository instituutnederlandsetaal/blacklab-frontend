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
				:key="entry.id"
				:options="options"
				@add-attribute-group="addAttribute($event, entry)"
				@delete-attribute="deleteAttribute(entry.id)"
				v-model="model.entries[index]"
			/>

			<!-- Nested Attribute Group -->
			<CqlAttributeGroup
				v-else-if="isCqlAttributeGroupData(entry)"
				:key="entry.id"
				:is-root="false"
				:options="options"
				@delete-group="deleteNestedGroup"
				v-model="model.entries[index]"
			/>
		</template>

		<!-- Add Controls -->
		<CqlAddAttributeButton v-if="shouldShowAddControls" @click="addAttribute($event)" :options="options"/>
	</div>
</template>

<script lang="ts">
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

import useModel from './useModel';

export default useModel<CqlAttributeGroupData>().extend({
	name: 'CqlAttributeGroup',
	components: {
		CqlAttribute,
		CqlAddAttributeButton
	},
	props: {
		isRoot: { type: Boolean, default: false },
		options: { type: Object as () => CqlQueryBuilderOptions, required: true },
	},
	computed: {
		shouldShowAddControls(): boolean {
			// Show add controls if we have any content or if we're the root group
			return this.isRoot || this.model.entries.length > 0;
		},
		currentOperatorOption(): Option {
			return this.options.operatorOptions.find(op => op.value === this.model.operator) || {
				value: this.model.operator,
				label: this.model.operator
			}
		}
	},
	methods: {
		// Helper methods for type checking
		isCqlAttributeData(entry: CqlGroupEntry): entry is CqlAttributeData {
			return 'annotationId' in entry;
		},

		isCqlAttributeGroupData(entry: CqlGroupEntry): entry is CqlAttributeGroupData {
			return 'entries' in entry;
		},

		createDefaultAttribute(): CqlAttributeData {
			return {
				id: `attr_${uid()}`,
				annotationId: this.options.defaultAnnotationId,
				comparator: '=',
				values: [''],
				caseSensitive: false
			};
		},

		addAttribute(operator: CqlAnnotationCombinator, calledForAttribute?: CqlAttributeData) {
			// Optimization: If there's only one attribute in the group,
			// just change the operator and add a new attribute instead of creating nested groups
			if (this.model.entries.length <= 1) {
				// Change the group's operator to the new operator
				this.model.operator = operator;
			}
			if (operator === this.model.operator) {
				// just insert a new attribute
				const index = calledForAttribute
					? this.model.entries.findIndex(e => e.id === calledForAttribute.id) + 1
					: this.model.entries.length;
				this.model.entries.splice(index, 0, this.createDefaultAttribute());
				this.emitUpdate();
				return;
			}

			// Replace existing attribute with a group containing it + a new attribute
			if (calledForAttribute) {
				const newGroup: CqlAttributeGroupData = {
					id: `group_${uid()}`,
					operator: operator,
					entries: [calledForAttribute, this.createDefaultAttribute()]
				};
				const index = this.model.entries.findIndex((entry: CqlGroupEntry) => entry.id === calledForAttribute.id);
				this.model.entries.splice(index, 1, newGroup);
				this.emitUpdate();
				return;
			}

			// Base case, replace whole group.
			const newGroup = this.model;
			this.model = {
				id: `group_${uid()}`,
				operator: operator,
				entries: [newGroup, this.createDefaultAttribute()]
			};
			this.emitUpdate();
		},

		updateAttribute(updatedAttribute: CqlAttributeData) {
			const index = this.model.entries.findIndex((entry: CqlGroupEntry) =>
				this.isCqlAttributeData(entry) && entry.id === updatedAttribute.id);
			if (index !== -1) {
				this.$set(this.model.entries, index, updatedAttribute);
				this.emitUpdate();
			}
		},

		deleteAttribute(attributeId: string) {
			const index = this.model.entries.findIndex((entry: CqlGroupEntry) =>
				this.isCqlAttributeData(entry) && entry.id === attributeId);
			if (index !== -1) {
				this.model.entries.splice(index, 1);
				this.checkIfShouldRemoveEmptyGroup();
				this.emitUpdate();
			}
		},

		updateNestedGroup(updatedGroup: CqlAttributeGroupData) {
			const index = this.model.entries.findIndex((entry: CqlGroupEntry) =>
				this.isCqlAttributeGroupData(entry) && entry.id === updatedGroup.id);
			if (index !== -1) {
				this.$set(this.model.entries, index, updatedGroup);
				this.emitUpdate();
			}
		},

		deleteNestedGroup(groupId: string) {
			const index = this.model.entries.findIndex((entry: CqlGroupEntry) =>
				this.isCqlAttributeGroupData(entry) && entry.id === groupId);
			if (index !== -1) {
				this.model.entries.splice(index, 1);
				this.checkIfShouldRemoveEmptyGroup();
				this.emitUpdate();
			}
		},

		checkIfShouldRemoveEmptyGroup() {
			// If this is not the root group and it's empty, suggest removal
			if (!this.isRoot && this.model.entries.length === 0) {
				this.$emit('delete-group', this.model.id);
			}
		},

		emitUpdate() {
			this.$emit('update:group', this.model);
		}
	},
});
</script>

<style lang="scss">

.bl-token-attribute-group {
	padding: 0px;
	/* 	No margin-top here, as the topmost group does not require spacing above it
		Spacing is instead done in all subgroups, which also have the well class */
	display: flex;
	flex-direction: column;
	gap: 8px;
}
.bl-token-attribute-group.well {
	padding: 3px 8px 8px 8px;
	margin-top: 6px;
	margin-bottom: 0;

	box-shadow: 4px 4px 7px -3px rgba(0,0,0,0.38);
	border: 1px solid rgba(0,0,0,0.15);
}



.bl-create-attribute-dropdown {
	align-self: center;
}

</style>