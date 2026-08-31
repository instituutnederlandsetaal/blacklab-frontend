<template>
	<div class="modal fade in" :class="size" tabindex="-1" role="dialog" @click.self="closeFromBackdrop">
		<div class="modal-dialog" role="document">
			<div class="modal-content">
				<div class="modal-header">
					<button v-if="close" type="button" :disabled="!closeEnabled" class="close" @click="emit('close')">×</button>
					<slot name="title"
						><h4 class="modal-title">{{ title }}</h4></slot
					>
					<slot name="header"></slot>
				</div>
				<div class="modal-body">
					<slot name="body"></slot>
					<slot name="default"></slot>
				</div>
				<div class="modal-footer">
					<slot name="footer"></slot>
					<button v-if="close" type="button" class="btn" :class="closeClass" :disabled="!closeEnabled" @click="emit('close')">
						{{ closeMessage }}
					</button>
					<button v-if="confirm" type="button" class="btn" :class="confirmClass" :disabled="!confirmEnabled" @click="emit('confirm')">
						{{ confirmMessage }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue';

const props = withDefaults(
	defineProps<{
		close?: boolean;
		closeEnabled?: boolean;
		closeMessage?: string;
		closeClass?: string;
		confirm?: boolean;
		confirmEnabled?: boolean;
		confirmMessage?: string;
		confirmClass?: string;
		title?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'auto' | 'fullscreen';
	}>(),
	{
		close: true,
		closeEnabled: true,
		closeMessage: 'Close',
		closeClass: 'btn-default',
		confirm: true,
		confirmEnabled: true,
		confirmMessage: 'OK',
		confirmClass: 'btn-primary',
		title: 'Title',
	},
);

const emit = defineEmits<{ close: []; confirm: [] }>();

function updateBodyModalCount(delta: 1 | -1) {
	const count = Math.max(0, (Number.parseInt(document.body.dataset.modalCount || '0', 10) || 0) + delta);
	document.body.dataset.modalCount = String(count);
	document.body.classList.toggle('modal-open', count > 0);
}

function closeFromBackdrop() {
	if (props.close && props.closeEnabled) emit('close');
}

updateBodyModalCount(1);
onBeforeUnmount(() => updateBodyModalCount(-1));
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
	@media (min-width: 767px) {
		padding: 17px;
	}
	@media (min-width: 992px) {
		padding: 30px;
	} // normally quite a bit of padding
	@media (max-height: 767px) {
		padding-top: 17px;
		padding-bottom: 17px;
	}
	@media (max-height: 639px) {
		padding-top: 0;
		padding-bottom: 0;
	}

	> .modal-dialog {
		display: flex;
		flex-direction: column;
		max-height: 100%;
		margin: 0;

		> .modal-content {
			display: flex;
			flex: 1;
			flex-direction: column;
			max-height: 100%;

			> .modal-body {
				flex: 1;
				overflow-y: auto;
			}
		}
	}

	&.xs > .modal-dialog {
		width: 600px;
	}
	&.sm > .modal-dialog {
		width: 750px;
	}
	&.md > .modal-dialog {
		width: 970px;
	}
	&.lg > .modal-dialog {
		width: 1170px;
	}
	&.auto > .modal-dialog {
		width: auto;
		max-width: 1170px;
	}
	&.fullscreen > .modal-dialog {
		width: 100%;
		height: 100%;
	}
}
</style>
