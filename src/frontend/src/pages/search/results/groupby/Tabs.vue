<template>
	<div :data-active="active">
		<ul class="nav nav-tabs">
			<li v-for="t in tabs" class="nav-item" :class="{active: t === active}" :key="t"  @click.prevent="active = t">
				<a href="#" :class="{active: t === active}">{{ t }}</a>
			</li>
		</ul>
		<div class="tab-content" style="padding: 10px;">
			<VNode v-if="active && $slots[active]" :key="active" :vnode="$slots[active]"/>
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
	props: {
		value: {
			type: String as () => null|string,
			default: null
		}
	},
	data: () => ({
		internalValue: '',
		counter: 0,
	}),
	computed: {
		tabs(): string[] { return Object.keys(this.$slots || {}); },
		active: {
			get(): string { return this.value || this.internalValue; },
			set(v: string) { this.$emit('input', this.internalValue = v); }
		},
	},
	watch: {
		tabs: {
			immediate: true,
			handler() { if (!this.tabs.includes(this.active)) { this.active = this.tabs[0]; } },
		},
	},
});
</script>