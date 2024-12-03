<template>
	<div class="multi-value-picker">
		<div class="selected" v-if="selected.length">
			<ul>
				<li class='option' v-for="v in selected" :key="v ? v.value : 'x'" :data-value="v ? v.value : 'x'" :title="$t('widgets.clickToRemove').toString()" @click="clickLabel($event?.target)">
					{{ v.label || v.value }}
				</li>
			</ul>
		</div>
		<div class="add" v-if="optionsNotYetSelected.length > 0">
			<SelectPicker :options="optionsNotYetSelected" :value="selectValue" @input="add($event)" data-menu-width="grow" hideEmpty/>
		</div>
	</div>
</template>

<script lang="ts">

// tslint:disable

import Vue from 'vue';
import SelectPicker from '@/components/SelectPicker.vue';

export type SimpleOption = string;

export type Option = {
	value: string;
	label?: string;
	title?: string|null;
	disabled?: boolean;
};
export type OptGroup = {
	label?: string;
	title?: string|null;
	disabled?: boolean;
	options: Array<string|Option>;
};

export type Options = Array<SimpleOption|Option|OptGroup>;

export default Vue.extend({
	components:	{
		SelectPicker,
	},
	props: {
		options: {
			type: Array as () => Option[],
			default: () => [] as Option[]
		},
		value: Array as () => string[]|null,
		textNoneSelected: {
			type: String,
			default: ''
		},
		textSelected: {
			type: String,
			default: ''
		},
	},
	computed: {
		optionsNotYetSelected(): Option[] {
			return this.options.filter(o => !this.selected.includes(o));
		},
		selected(): Option[] {
			const result = this.value?.map(v => this.options.find(o => (o as Option).value === v) as Option)
				.filter(v => v !== undefined) || [];
			return result;
		},
	},
	methods: {
		add(v: string) {
			const opt = this.options.find(o => (o as Option).value === v);
			if (opt) {
				const i = this.selected.indexOf(opt);
				if (i < 0) {
					// Not yet selected: add it at the end
					this.$emit('input', this.selected.concat([opt]).map(o => o.value));
				}
			}
		},
		clickLabel(target: EventTarget|null) {
			if (target && target instanceof HTMLElement) {
				const v = target.getAttribute('data-value') || target.innerText;
				this.remove(v);
			}
		},
		remove(v: string) {
			this.$emit('input', this.selected.filter(o => o.value !== v).map(o => o.value));
		},
	},
	data: () =>  ({
		selectValue: null as string|null,
	}),
	mounted() {
	},
	beforeDestroy() {
	},
});
</script>

<style lang="scss" scoped>

div.selected {
	margin-top: 0.5rem;
	margin-bottom: 0.5rem;
	max-height: 3cm;
	overflow: auto;

	ul {
		display: inline;
		padding: 0;
		li {
			list-style-type: none;
			display: inline-block;
			margin: 2px;
			user-select: none;
		}
		li.option {
			position: relative;
			top: 1px;
			background-color: lighten(#337ab7, 40); // $panel-color (global.scss); maybe separate variables into file we can import here?
			color: black;
			padding: 7px;
			border-radius: 3px;
			cursor: pointer;
			&::after {
				font-weight: bold;
				content: '✕';
				margin-left: 5px;
			}
		}
	}
}

</style>