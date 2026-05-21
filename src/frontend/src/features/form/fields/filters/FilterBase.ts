import type { ComponentObjectPropsOptions, ExtractPublicPropTypes, Prop, PropType } from 'vue';
import { defineComponent } from 'vue';

import type { MetadataFilterFieldConfig } from '@/features/form/model/controllers/metadata-filter-controller';

export type BaseFilterProps<T, M = never> = {
	config: MetadataFilterFieldConfig<M>;
	modelValue: T;
	htmlId: string;
	showLabel: boolean;
};

// This is the standard object that's allowed in props, e.g. `{ type: String, default: 'foo', required: false }`
// But it's not exported, so we need to reconstitute it here to be able to use it ourselves
type PropOptions<T> = Exclude<Prop<T>, PropType<any>>;

export function createBaseFilterPropsRuntimeObject<T, M = never>(valueProp: PropOptions<T>) {
	return {
		config: {
			type: Object as PropType<MetadataFilterFieldConfig<M>>,
			required: true,
		},
		modelValue: {
			...valueProp,
			required: true,
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
				return this.config.id;
			},
			inputId(): string {
				return `${this.htmlId}_value`;
			},
			displayName(): string {
				return this.config.displayName || this.config.id;
			},
			description(): string | undefined {
				return this.config.description;
			},
		},
	});
	return component;
}
