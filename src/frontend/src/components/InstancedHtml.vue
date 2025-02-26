<template>
	<div></div>
</template>

<script lang="ts">
import Vue from 'vue';
export default Vue.extend({
	props: {
		value: null as any as () => HTMLElement|null|undefined|string,
	},
	watch: {
		value: {
			immediate: true,
			handler() {
				this.$nextTick(() => { // wait for mount
					if (typeof this.value === 'string') this.$el.innerHTML = '';
					else if (this.value) this.$el.replaceChildren(this.value);
				})
			},
		},
	},
})
</script>