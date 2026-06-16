<template>
	<div :data-active="active">
		<ul class="nav nav-tabs">
			<li v-for="t in tabs" class="nav-item" :class="{ active: t === active }" :key="t" @click.prevent="active = t">
				<a href="#" :class="{ active: t === active }">{{ t }}</a>
			</li>
		</ul>
		<div class="tab-content" style="padding: 10px">
			<component v-if="active && $slots[active]" :key="active" :is="$slots[active]" />
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

import VNode from './VNode.vue';
export default defineComponent({
	components: {
		VNode,
	},
	emits: ['update:modelValue'],
	props: {
		modelValue: {
			type: [String, null],
			default: null,
		},
	},
	data: () => ({
		internalValue: '',
		counter: 0,
	}),
	computed: {
		tabs(): string[] {
			return Object.keys(this.$slots || {});
		},
		active: {
			get(): string {
				return this.modelValue || this.internalValue;
			},
			set(v: string) {
				this.$emit('update:modelValue', (this.internalValue = v));
			},
		},
	},
	watch: {
		tabs: {
			immediate: true,
			handler() {
				if (!this.tabs.includes(this.active)) {
					this.active = this.tabs[0];
				}
			},
		},
	},
});
</script>
