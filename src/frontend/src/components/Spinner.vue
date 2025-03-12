<template>
	<div v-if="position" :class="`cf-spinner-${position}`">
		<div class="fa fa-spinner fa-spin cf-spinner" :class="classes" :style="style">&ZeroWidthSpace;</div>
	</div>
	<div v-else class="fa fa-spinner fa-spin cf-spinner" :class="classes" :style="style">&ZeroWidthSpace;</div>
</template>

<script lang="ts">
import Vue from 'vue';
export default Vue.extend({
	props: {
		lg: Boolean,
		xs: Boolean,
		sm: Boolean,
		size: [Number, String],


		// Only one of these should be set
		// inline is inline-block
		// overlay is absolute center of parent element
		// left, center, right are a block, with the spinner in the left, center or right
		// We default to 'center' if none are set.
		inline: Boolean,
		overlay: Boolean,
		left: Boolean,
		center: Boolean,
		right: Boolean,
	},
	data: () => ({ observer: null as ResizeObserver|null, }),
	computed: {
		position(): 'left'|'center'|'right'|undefined {
			if (this.left == this.right == this.center == null) return 'center';
			if (this.inline || this.overlay) return undefined;
			if (this.left) return 'left';
			if (this.right) return 'right';
			if (this.center) return 'center';
			return undefined;
		},
		classes(): any { return {lg: this.lg, sm: this.sm, overlay: this.overlay, inline: this.inline, xs: this.xs} },
		style(): any { return { fontSize: this.size ? (typeof this.size === 'number' || this.size.match(/^\d+$/)) ? this.size + 'px' : this.size : undefined,} }
	},
	mounted() {
		if (this.overlay) {
			const parent = this.$el.parentElement as HTMLElement;
			parent.style.position='relative';
			// size observer and center spinner
			this.observer = new ResizeObserver(() => {
				const {width, height} = parent.getBoundingClientRect();
				// don't use boundingClientRect for ourselves. It changes when the our element rotates
				const ownWidth =  this.$el.scrollWidth;
				const ownHeight = this.$el.scrollHeight;
				const left = width / 2 - ownWidth / 2;
				const top = height / 2 - ownHeight / 2;
				// @ts-ignore
				this.$el.style.left = `${left}px`;
				// @ts-ignore
				this.$el.style.top = `${top}px`;
			});
			this.observer.observe(parent);

		}
	},
	beforeDestroy() { if (this.observer) this.observer.disconnect(); }
})
</script>

<style lang="scss" scoped>

.cf-spinner-center {
	text-align: center;
}
.cf-spinner-right {
	text-align: right;
}
.cf-spinner-left {
	text-align: left;
}

.cf-spinner {
	color: white;
	background-color: black;
	opacity: 0.4;
	border-radius: 50%;
	padding: 0.2em;
	font-size: 80px;

	&.overlay {
		position: absolute;
		z-index: 1000;
	}

	&.inline {
		display: inline-block;
		font-size: 1em;
	}
	&.xs {
		font-size: 20px;
		padding: 2px;
	}
	&.sm {
		font-size: 40px;
		padding: 5px;
	}
	&.lg {
		font-size: 120px;
		padding: 20px;
	}
}
</style>