import Vue from 'vue';

// just for whatever metadata might be needed here.
import { FilterDefinition, Option } from '@/types/apptypes';

const baseFilter = Vue.extend({
	props: {
		definition: {
			type: Object as () => FilterDefinition,
			required: true
		},
		// you should probably set a default value in the extended component.
		value: undefined as any as () => any,
		textDirection: {
			type: String as () => 'ltr'|'rtl',
			required: true
		},
		htmlId: String,
		showLabel: {
			type: Boolean,
			default: true
		}
	},
	methods: {
		e_input(value: any) { this.$emit('change-value', value); },
	},
	computed: {
		id(): string { return this.definition.id; },
		inputId(): string { return `${this.htmlId}_value`; },
		displayName(): string { return this.$tMetaDisplayName(this.definition); },
		description(): string|undefined { return this.$tMetaDescription(this.definition); },
		/** Return the options but with their localized labels */
		options(): Option[]|undefined {
			return Array.isArray(this.definition.metadata) ? this.definition.metadata : undefined;
		}
	},
});

export default baseFilter;
