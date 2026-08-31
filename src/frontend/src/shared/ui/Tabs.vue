<template>
	<div
		ref="tabsElement"
		class="tabs"
		:class="{ vertical: props.vertical, flexy: props.flexy, wrap: props.wrap, small: props.small, large: props.large, empty: !tabsModel.length }"
		role="tablist"
		:aria-label="props.ariaLabel"
		:aria-orientation="props.vertical ? 'vertical' : 'horizontal'"
		v-bind="attrs"
	>
		<div
			v-for="(tab, index) in tabsModel"
			:key="tab.id ?? tab.value"
			:class="[
				'tab',
				tab.class,
				{
					active: index === selectedIndex,
					disabled: tab.disabled,
					'text-muted': tab.disabled,
					'text-primary': !tab.disabled && index !== selectedIndex,
					'text-body': index === selectedIndex,
				},
			]"
			:style="tab.style"
			@click.self="selectTab(index)"
			@click.middle.prevent.stop="emit('middlemouse', { tab, index })"
		>
			<slot name="default" :tab :i="index" :selected="index === selectedIndex" :select="() => selectTab(index)">
				<span v-if="$slots.before" class="tab-before">
					<slot name="before" :tab :i="index"></slot>
				</span>
				<button
					:id="tab.id"
					type="button"
					role="tab"
					:class="{
						'tab-button': true,
						disabled: tab.disabled,
					}"
					:title="optionText(tab.title) || ''"
					:disabled="tab.disabled"
					:aria-controls="tab.controls"
					:aria-selected="index === selectedIndex"
					:tabindex="index === focusableIndex ? 0 : -1"
					@click="selectTab(index)"
					@keydown="handleKeydown($event, index)"
				>
					<slot name="label" :tab :i="index" :selected="index === selectedIndex">
						{{ optionLabel(tab) }}
					</slot>
				</button>
				<span v-if="$slots.after" class="tab-after">
					<slot name="after" :tab :i="index"></slot>
				</span>
			</slot>
		</div>
		<div v-if="hasInvalidSelection" class="tab active invalid bg-warning text-warning">
			<button class="tab-button" type="button" role="tab" disabled :aria-selected="true">{{ props.invalidTabLabel }}</button>
		</div>
	</div>
	<p v-if="hasInvalidSelection" class="tabs-invalid text-warning" role="status">
		<slot name="invalid" :model-value="props.modelValue">{{ props.invalidSelectionMessage }}</slot>
	</p>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useAttrs } from 'vue';

import type { Tab } from './Tabs.types';

import { optionLabel, optionText } from '@/shared/utils/options';

defineOptions({
	inheritAttrs: false,
});

const attrs = useAttrs();

const props = withDefaults(
	defineProps<{
		modelValue?: string | number | null;
		tabs: Array<string | Tab>;
		vertical?: boolean;
		flexy?: boolean;
		wrap?: boolean;
		small?: boolean;
		large?: boolean;
		/** Accessible label for the tab list. */
		ariaLabel?: string;
		/** Message displayed when a controlled modelValue does not match a tab. */
		invalidSelectionMessage?: string;
		/** Label used for the disabled placeholder tab shown for an unavailable selection. */
		invalidTabLabel?: string;
	}>(),
	{
		modelValue: null,
		ariaLabel: 'Tabs',
		invalidSelectionMessage: 'The selected tab is unavailable.',
		invalidTabLabel: 'Unavailable tab',
	},
);

const emit = defineEmits<{
	'update:modelValue': [value: string | number];
	middlemouse: [payload: { tab: Tab; index: number }];
}>();

const tabsElement = ref<HTMLElement | null>(null);
const internalModel = ref(-1);
const tabsModel = computed<Tab[]>(() => props.tabs.map(tab => (typeof tab === 'string' ? { label: tab, value: tab } : tab)));
const selectedIndex = computed(() => {
	if (typeof props.modelValue === 'number') return tabsModel.value[props.modelValue] ? props.modelValue : -1;
	if (typeof props.modelValue === 'string') return tabsModel.value.findIndex(tab => tab.value === props.modelValue);
	return tabsModel.value[internalModel.value] ? internalModel.value : -1;
});
const enabledIndexes = computed(() => tabsModel.value.flatMap((tab, index) => (tab.disabled ? [] : [index])));
const focusableIndex = computed(() => (enabledIndexes.value.includes(selectedIndex.value) ? selectedIndex.value : (enabledIndexes.value[0] ?? -1)));
const hasInvalidSelection = computed(() => props.modelValue !== null && selectedIndex.value === -1);

function selectTab(index: number) {
	const tab = tabsModel.value[index];
	if (!tab || tab.disabled) return;

	// Emit either a number or a string, depending on what was put in.
	emit('update:modelValue', typeof props.modelValue === 'string' ? tab.value : index);
	internalModel.value = index;
}

function handleKeydown(event: KeyboardEvent, index: number) {
	if (!enabledIndexes.value.length) return;

	const backwards = props.vertical ? 'ArrowUp' : 'ArrowLeft';
	const forwards = props.vertical ? 'ArrowDown' : 'ArrowRight';
	let targetIndex: number | undefined;
	const currentEnabledIndex = enabledIndexes.value.indexOf(index);
	if (event.key === forwards) targetIndex = enabledIndexes.value[(currentEnabledIndex + 1 + enabledIndexes.value.length) % enabledIndexes.value.length];
	if (event.key === backwards) targetIndex = enabledIndexes.value[(currentEnabledIndex - 1 + enabledIndexes.value.length) % enabledIndexes.value.length];
	if (event.key === 'Home') targetIndex = enabledIndexes.value[0];
	if (event.key === 'End') targetIndex = enabledIndexes.value[enabledIndexes.value.length - 1];
	if (targetIndex == null) return;

	event.preventDefault();
	selectTab(targetIndex);
	void nextTick(() => tabsElement.value?.querySelectorAll<HTMLElement>('[role="tab"]')[targetIndex]?.focus());
}
</script>

<style lang="scss" scoped>
$tab-radius: 4px;

.tabs {
	--tab-padding-y: 10px;
	--tab-padding-x: 15px;

	--tabs-background-color: #fff;
	--tabs-border-color: #ddd;
	--tab-background-color: transparent;
	--tab-active-background-color: #fff;
	--tab-hover-background-color: #efefef;
	--tab-active-border-color: #ddd;

	&.small {
		--tab-padding-y: 6px;
		--tab-padding-x: 12px;
	}

	&.large {
		--tab-padding-y: 12px;
		--tab-padding-x: 18px;
	}

	&.tabs-primary {
		--tabs-background-color: var(--tabs-primary-color, #337ab7);
		--tabs-border-color: transparent;
		--tab-active-border-color: var(--tabs-primary-color, #337ab7);
		--tab-inactive-color: #fff;
		--tab-active-color: #555;

		&.text-primary {
			--tabs-background-color: var(--tabs-primary-color, currentColor);
		}
	}

	&.tabs-primary > .tab:not(.active):not(.disabled) {
		color: var(--tab-inactive-color);
	}

	&.tabs-primary > .tab:not(.active):not(.disabled):hover,
	&.tabs-primary > .tab.active {
		color: var(--tab-active-color);
	}
}

.tabs {
	display: flex;
	background: var(--tabs-background-color);
	border-top-left-radius: $tab-radius;
	border-top-right-radius: $tab-radius;

	&.wrap {
		flex-wrap: wrap;
	}

	.tab {
		// Bootstrap's base button sizing.
		display: flex;
		align-items: center;

		&:not(.invalid) {
			background: var(--tab-background-color);
		}

		&:not(.active):not(.disabled):hover {
			background: var(--tab-hover-background-color);
		}

		border: 1px solid transparent;

		&.active,
		&.invalid {
			border-color: var(--tab-active-border-color);
		}

		> .tab-button {
			align-self: stretch;
			padding: var(--tab-padding-y) var(--tab-padding-x);
			background: none;
			border-radius: 0;
			border: none;
			margin: 0;
			text-decoration: none;
			flex: 1 1 auto;
			display: flex;
			align-items: center;
			white-space: nowrap;
		}

		> .tab-before,
		> .tab-after {
			align-self: stretch;
			display: flex;
			align-items: center;
			padding: 0;

			// Common slot controls should feel like part of the tab. More complex
			// slot content can provide its own layout styles from its parent.
			// NOTE: this is vue's slotted selector, not the css ::slotted selector. See https://vuejs.org/api/sfc-css-features
			> :slotted(a),
			> :slotted(button) {
				align-self: stretch;
				display: inline-flex;
				align-items: center;
			}
		}

		> .tab-before:empty,
		> .tab-after:empty {
			display: none;
		}

		> .tab-before:not(:empty) {
			padding-left: var(--tab-padding-x);
		}

		> .tab-after:not(:empty) {
			padding-right: var(--tab-padding-x);
		}

		&:has(> .tab-before:not(:empty)) > .tab-button {
			padding-left: 0;
		}

		&:has(> .tab-after:not(:empty)) > .tab-button {
			padding-right: 0;
		}

		&.active:not(.invalid) {
			background: var(--tab-active-background-color);
		}

		&.disabled {
			// opacity: 0.65;

			> .tab-button {
				cursor: not-allowed;
			}
		}
	}

	&.flexy {
		flex-grow: 1;
		.tab {
			flex-grow: 1;
		}
	}

	&.small .tab {
		font-size: 12px;
	}

	&.large .tab {
		font-size: 18px;
	}
}

// The tab list owns the separator. A selected tab owns its outline and overlaps
// the separator with its background on the side where the two meet.
.tabs {
	&:not(.vertical):not(.empty) {
		border-bottom: 1px solid var(--tabs-border-color);

		> .tab {
			border-radius: $tab-radius $tab-radius 0 0;
			margin: 0 4px -1px 0;

			&:last-child {
				margin-right: -1px; // Collapse border with container.
			}

			&.active {
				border-bottom-color: var(--tab-active-border-color);
			}

			&.active:not(.invalid) {
				border-bottom-color: var(--tab-active-background-color);
				z-index: 2;
			}
		}
	}

	&.wrap > .tab {
		margin-right: 0 !important;
		margin-top: 2px;
	}

	&.vertical:not(.empty) {
		display: inline-flex;
		flex-direction: column;
		border-right: 1px solid var(--tabs-border-color);

		> .tab {
			text-align: right;
			border-radius: $tab-radius 0 0 $tab-radius;
			margin: 4px -1px 0 0;

			&:first-child {
				margin-top: -1px; // Collapse border with container.
			}

			&:last-child {
				margin-bottom: -1px; // Collapse border with container.
			}

			&.active {
				border-right-color: var(--tab-active-border-color);
			}

			&.active:not(.invalid) {
				border-right-color: var(--tab-active-background-color);
				z-index: 2;
			}
		}
	}
}

.tabs-invalid {
	margin: 8px 0 0;
}
</style>
