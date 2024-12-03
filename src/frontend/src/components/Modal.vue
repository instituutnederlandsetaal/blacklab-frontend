<template>
	<div :class="classes" tabindex="-1" role="dialog">

		<div class="modal-content" :class="{'container': !size}">
			<div class="modal-header">
				<button v-if="close" type="button" :disabled="!closeEnabled" class="close" @click="$emit('close')">×</button>
				<slot name="title"><h4 class="modal-title">{{ title }}</h4></slot>
				<slot name="header"></slot>
			</div>
			<div class="modal-body">
				<slot name="body"></slot>
				<slot name="default"></slot>
			</div>
			<div class="modal-footer">
				<slot name="footer"></slot>
				<button v-if="close" type="button" class="btn" :class="closeClass" :disabled="!closeEnabled" @click="$emit('close')">{{ closeMessage }}</button>
				<button v-if="confirm" type="button" class="btn" :class="confirmClass" :disabled="!confirmEnabled" @click="$emit('confirm')">{{ confirmMessage }}</button>
			</div>
		</div>

	</div>
</template>

<script lang="ts">
import Vue from 'vue';

// We want a few modes
// a 'sm', 'lg' and 'xl' which will be the various container widths
// without any settings, determine based on the screen size (use bootstrap container size)
// an auto size, which will be as large as the content, but not larger than the screen.

// maybe something like shrink true/false in addition to a size='sm|lg|xl|auto'

export default Vue.extend({
	props: {
		close: {default: true},
		closeEnabled: {default: true},
		closeMessage: {default: 'Close'},
		closeClass: {default: 'btn-default'},

		confirm: {default: true},
		confirmEnabled: {default: true},
		confirmMessage: {default: 'OK'},
		confirmClass: {default: 'btn-primary'},

		title: {default: 'Title'},
		size: { type: String as () => 'xs' | 'sm' | 'md' | 'lg' | 'auto' | 'fullscreen' | undefined },
		xs: Boolean,
		sm: Boolean,
		md: Boolean,
		lg: Boolean,
		auto: Boolean,
		fullscreen: Boolean,
	},
	computed: {
		classes(): Record<string, boolean> {
			const c: any = {
				'modal': true,
				'fade': true,
				'in': true,
				'xs': !this.size && this.xs,
				'sm': !this.size && this.sm,
				'md': !this.size && this.md,
				'lg': !this.size && this.lg,
				'auto': !this.size && this.auto,
				'fullscreen': !this.size && this.fullscreen,
			}
			if (this.size) c[this.size] = true;

			return c;
		}
	},
	created() {
		document.body.classList.add('modal-open');
		document.body.setAttribute('data-modal-count', (parseInt(document.body.getAttribute('data-modal-count') || '0') + 1).toString());
	},
	beforeDestroy() {
		document.body.setAttribute('data-modal-count', (parseInt(document.body.getAttribute('data-modal-count') || '0') - 1).toString());
		if (!document.body.hasAttribute('data-modal-count') || document.body.getAttribute('data-modal-count') === '0')
			document.body.classList.remove('modal-open');
	}
})
</script>

<style lang="scss" scoped>


// wrapper/backdrop. Should be fullscreen with some padding to prevent the modal itself from touching the screen edges.
.modal {
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;

	// less padding on small screens
	padding: 0;
	@media (min-width: 767px) { padding: 17px; }
	@media (min-width: 992px) { padding: 30px; } // normally quite a bit of padding
	@media (max-height: 767px) { padding-top: 17px; padding-bottom: 17px;}
	@media (max-height: 639px) { padding-top: 0; padding-bottom: 0;}


	> .modal-content {
		display: flex;
		flex-direction: column;
		max-height: 100%;

		&.container {
			padding: 0;
		}

		> .modal-body {
			flex: 1;
			overflow-y: auto;
		}
	}

	&.xs > .modal-content { width: 600px; }
	&.sm > .modal-content { width: 750px; }
	&.md > .modal-content { width: 970px; }
	&.lg > .modal-content { width: 1170px; }
	&.auto > .modal-content { width: auto; max-width: 1170px; }
	&.fullscreen > .modal-content { width: 100%; height: 100%; }
}


</style>
