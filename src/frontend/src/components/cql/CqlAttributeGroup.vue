<template>
	<div class="bl-token-attribute-group" :class="{ well: !isRoot }" :id="model.id">
		<!-- Mixed Entries with Operators -->
		<template v-for="(entry, index) in model.entries" class="bl-attribute-entry-wrapper">
			<!-- Operator Label (shown before each entry except the first one) -->
			<div v-if="index > 0"
				:key="`operator-${entry.id}`"
				class="bl-token-attribute-group-label"
			>
				{{ $td(`search.advanced.queryBuilder.boolean_operators.${currentOperatorOption.label}`, currentOperatorOption.label) }}
			</div>

			<!-- Attribute Entry -->
			<CqlAttribute
				v-if="isCqlAttributeData(entry)"
				:key="entry.id"
				@add-attribute-group="addAttribute($event, entry)"
				@delete-attribute="deleteAttribute(entry.id)"
				v-model="model.entries[index]"
			/>

			<!-- Nested Attribute Group -->
			<CqlAttributeGroup
				v-else-if="isCqlAttributeGroupData(entry)"
				:key="entry.id"
				:is-root="false"
				@delete-group="deleteNestedGroup"
				v-model="model.entries[index]"
			/>
		</template>

		<!-- Add Controls -->
		<div v-if="!isRoot || shouldShowAddControls" class="dropup bl-create-attribute-dropdown">
			<button
				type="button"
				class="btn btn-sm btn-default dropdown-toggle"
				data-toggle="dropdown"
				:title="$t('search.advanced.queryBuilder.attribute_create_button_title').toString()"
			>
				<span class="glyphicon glyphicon-plus"></span>&#8203;
			</button>
			<ul class="dropdown-menu">
				<li v-for="operator in operatorOptions" :key="operator.value">
					<a
						href="#"
						@click.prevent="addAttribute(operator.value)"
					>
						<span class="glyphicon glyphicon-plus-sign text-success"></span>
						{{ operator.label }}
					</a>
				</li>
			</ul>
		</div>
	</div>
</template>

<script lang="ts">
import { Option } from '@/types/apptypes';
import {
	CqlAttributeGroupData,
	CqlAttributeData,
	CqlGroupEntry,
	isCqlAttributeData,
	isCqlAttributeGroupData,
	DEFAULT_OPERATORS
} from '@/components/cql/cql-types';
import CqlAttribute from './CqlAttribute.vue';
import uid from '@/mixins/uid';
import * as UIStore from '@/store/search/ui';

import useModel from './useModel';

export default useModel<CqlAttributeGroupData>().extend({
	name: 'CqlAttributeGroup',
	components: {
		CqlAttribute
	},
	props: {
		isRoot: { type: Boolean, default: false },
	},
	computed: {
		shouldShowAddControls(): boolean {
			// Show add controls if we have any content or if we're the root group
			return this.isRoot || this.model.entries.length > 0;
		},
		operatorOptions(): Option[] {
			return DEFAULT_OPERATORS.map<Option>(op => ({
				label: this.$td(`search.advanced.queryBuilder.boolean_operators.${op.label}`, op.label),
				value: op.operator,
			}));
		},
		currentOperatorOption(): Option {
			return this.operatorOptions.find(op => op.value === this.model.operator) ?? {
				value: this.model.operator,
				label: this.model.operator
			};
		},
		defaultAnnotationId() { return UIStore.getState().search.advanced.defaultSearchAnnotationId },
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
				annotationId: this.defaultAnnotationId,
				comparator: '=',
				values: [''],
				caseSensitive: false
			};
		},

		addAttribute(operator: string, calledForAttribute?: CqlAttributeData) {
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
/* Using original CSS classes from cql_querybuilder.scss - no additional styles needed */
</style>