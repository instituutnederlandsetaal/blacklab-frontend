import type { ComponentObjectPropsOptions, ExtractPublicPropTypes, Prop, PropType } from 'vue';
import { defineComponent } from 'vue';

import type { MetadataFilterFieldConfig } from '@/features/form/model/controllers/metadata-filter-controller';

import type { Option } from '@/shared/utils/options';

export type BaseFilterProps<T, M = never> = {
	definition: MetadataFilterFieldConfig<M>;
	modelValue: T;
	textDirection: 'ltr' | 'rtl';
	htmlId: string;
	showLabel: boolean;
};

// This is the standard object that's allowed in props, e.g. `{ type: String, default: 'foo', required: false }`
// But it's not exported, so we need to reconstitute it here to be able to use it ourselves
type PropOptions<T> = Exclude<Prop<T>, PropType<any>>;

export function createBaseFilterPropsRuntimeObject<T, M = never>(valueProp: PropOptions<T>) {
	return {
		definition: {
			type: Object as PropType<MetadataFilterFieldConfig<M>>,
			required: true,
		},
		modelValue: {
			...valueProp,
			required: true,
		},
		textDirection: {
			type: String as PropType<'ltr' | 'rtl'>,
			default: 'ltr',
		},
		htmlId: {
			type: String,
			required: true,
		},
		showLabel: {
			type: Boolean,
			default: true,
		},
	} satisfies ComponentObjectPropsOptions<BaseFilterProps<T, M>>;
}

export type AnyBaseFilterPublicProps = ExtractPublicPropTypes<ReturnType<typeof createBaseFilterPropsRuntimeObject<any, any>>>;

export default function createBaseFilterComponent<T, M = never>(valueProp: PropOptions<T>) {
	const component = defineComponent({
		// Somehow Vue doesn't properly infer the props unless we embed them directly
		// and if we do that, we can't extract the type any longer
		// this is a workaround and you're not supposed to use it, but it works
		// I'm giving up on trying to debug this any longer.
		__typeProps: {} as BaseFilterProps<T, M>,
		emits: ['update:modelValue'],
		props: createBaseFilterPropsRuntimeObject<T, M>(valueProp),
		methods: {
			e_input(value: T) {
				this.$emit('update:modelValue', value);
			},
		},
		computed: {
			id(): string {
				return this.definition.id;
			},
			inputId(): string {
				return `${this.htmlId}_value`;
			},
			displayName(): string {
				return this.definition.defaultDisplayName || this.definition.id;
			},
			description(): string | undefined {
				return this.definition.defaultDescription;
			},
			/** Return the options but with their localized labels */
			options(): Option[] {
				if (Array.isArray(this.definition.metadata)) return this.definition.metadata as Option[];
				if (this.definition.metadata && typeof this.definition.metadata === 'object' && 'options' in this.definition.metadata && Array.isArray(this.definition.metadata.options))
					return this.definition.metadata.options as Option[];
				return [];
			},
		},
	});
	return component;
}
