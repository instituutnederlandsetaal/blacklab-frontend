<template>
	<div v-if="position && !overlay" :class="`cf-spinner-${position}`">
		<div ref="spinner" class="fa fa-spinner fa-spin cf-spinner" :class="classes" :style></div>
	</div>
	<div v-else ref="spinner" class="fa fa-spinner fa-spin cf-spinner" :class="classes" :style></div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
	lg?: boolean;
	xs?: boolean;
	sm?: boolean;
	size?: number | string;
	inline?: boolean;
	overlay?: boolean;
	left?: boolean;
	center?: boolean;
	right?: boolean;
	inverted?: boolean;
}>();
const spinner = ref<HTMLElement>();
const position = computed(() => (props.inline ? undefined : props.left ? 'left' : props.right ? 'right' : props.center ? 'center' : undefined));
const classes = computed(() => ({ lg: props.lg, sm: props.sm, overlay: props.overlay, inline: props.inline, xs: props.xs, inverted: props.inverted }));
const style = computed(() => ({ fontSize: props.size ? (typeof props.size === 'number' || /^\d+$/.test(props.size) ? `${props.size}px` : props.size) : undefined }));
let observer: ResizeObserver | undefined;
let restoreParentPosition: (() => void) | undefined;

onMounted(() => {
	if (!props.overlay) return;
	const element = spinner.value!;
	const parent = element.parentElement!;
	if (getComputedStyle(parent).position === 'static') {
		const inlinePosition = parent.style.position;
		parent.style.position = 'relative';
		restoreParentPosition = () => {
			if (parent.style.position === 'relative') parent.style.position = inlinePosition;
		};
	}
	observer = new ResizeObserver(() => {
		const { width, height } = parent.getBoundingClientRect();
		const left = props.left ? 0 : props.right ? width - element.scrollWidth : width / 2 - element.scrollWidth / 2;
		element.style.left = `${left}px`;
		element.style.top = `${height / 2 - element.scrollHeight / 2}px`;
	});
	observer.observe(parent);
});

onBeforeUnmount(() => {
	observer?.disconnect();
	restoreParentPosition?.();
});
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
	&.inverted {
		color: black;
		background-color: transparent;
		opacity: 0.4;
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
	--fa-width: 1em;
	box-sizing: content-box;
}
</style>
