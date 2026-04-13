import type { FilterDefinition, Option } from '@/types/apptypes';
import { defineComponent } from 'vue';
import type { PropType } from 'vue/dist/vue.js';

export default function createBaseFilterComponent<T, M = never>(
	valuePropType: true | PropType<T> | null | undefined,
	valuePropDefault?: () => T
)  {
	
	const component = defineComponent({
		props: {
			definition: {
				type: Object as PropType<FilterDefinition<T, M>>,
				required: true
			},
			modelValue: {
				type: valuePropType,
				default: valuePropDefault as unknown,
				required: true,
			},
			textDirection: {
				type: String as PropType<'ltr'|'rtl'>,
				required: true
			},
			htmlId: {
				type: String,
				required: true
			},
			showLabel: {
				type: Boolean,
				default: true
			}
		},
		methods: {
			e_input(value: T) { this.$emit('update:modelValue', value); },
		},
		computed: {
			id(): string { return this.definition.id; },
			inputId(): string { return `${this.htmlId}_value`; },
			displayName(): string { return this.$tMetaDisplayName(this.definition); },
			description(): string|undefined { return this.$tMetaDescription(this.definition); },
			/** Return the options but with their localized labels */
			options(): Option[]|undefined {
				if (Array.isArray(this.definition.metadata))
					return this.definition.metadata;
				return this.definition.metadata.options;
			}
		},
	});
	return component;
};