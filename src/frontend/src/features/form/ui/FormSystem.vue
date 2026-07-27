<template>
	<div class="blf-form-system">
		<section v-if="activeOverrides.length">
			<div v-for="override in activeOverrides" :key="override.parameter" class="blf-raw-override">
				<strong>{{ override.label }}</strong>
				<code>{{ override.value }}</code>
				<button type="button" class="btn btn-xs btn-default" @click="props.runtime.clearRawOverride(override.parameter)">Clear</button>
			</div>
		</section>
		<Component v-if="renderTree" :is="renderTree.is" v-bind="{ ...attrs, ...renderTree.props }" :key="runtimeRevision" class="blf-form-system" @submit="emit('submit', $event)" @reset="emit('reset')">
			<template #actions><slot name="actions" /></template>
		</Component>
	</div>
</template>

<script setup lang="ts">
import { computed, ref, toRef, useAttrs, watch } from 'vue';

import type { FormRuntime } from '@/features/form/model/form-runtime';
import type { BlackLabParameter } from '@/features/form/model/types/blacklab-params';
import type { CompiledFormStateWithSummaries } from '@/features/form/model/types/form-query';

import { provideFormSystemRuntime } from '../model/runtime';

const props = defineProps<{
	runtime: FormRuntime;
	rootId?: string;
}>();

const attrs = useAttrs();

const emit = defineEmits<{
	submit: [snapshot: CompiledFormStateWithSummaries];
	reset: [];
}>();

provideFormSystemRuntime(toRef(props, 'runtime'));

// Runtime-bound views may allocate watchers/loaders during setup. Recreate the
// rendered subtree when the session changes so none survive against old state.
const runtimeRevision = ref(0);
watch(
	() => props.runtime,
	() => runtimeRevision.value++,
);

const rawOverrideLabels: Record<BlackLabParameter, string> = {
	patt: 'Restored CQL',
	filter: 'Restored Lucene filter',
	searchfield: 'Restored search field',
};

const renderTree = computed(() => props.runtime.renderableGraph(props.rootId));

const activeOverrides = computed(() =>
	(Object.entries(props.runtime.state.rawOverrides.value ?? {}) as Array<[BlackLabParameter, string | null | undefined]>)
		.filter((entry): entry is [BlackLabParameter, string] => !!entry[1])
		.map(([parameter, value]) => ({
			parameter,
			value,
			label: rawOverrideLabels[parameter],
		})),
);
</script>

<style lang="scss">
.blf-form-system {
	--blf-accent: #337ab7;
	--blf-accent-soft: #d9edf7;
	--blf-border: #ccc;
	--blf-border-strong: #adadad;
	--blf-panel: #f7f9fb;
	--blf-text-muted: #777;
}

.blf-field-horizontal {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	min-width: 0;

	> .blf-field-label,
	> .blf-field-controls {
		grid-column: 1;
		min-width: 0;
	}
}

@media (min-width: 992px) {
	.blf-field-horizontal {
		grid-template-columns: minmax(125px, 140px) minmax(0, 1fr);
		column-gap: 15px;

		> .blf-field-label {
			grid-column: 1;
		}

		> .blf-field-controls {
			grid-column: 2;
		}
	}
}

.blf-raw-overrides {
	display: grid;
	gap: 8px;
	margin-bottom: 12px;
}

.blf-raw-override {
	display: grid;
	grid-template-columns: max-content minmax(0, 1fr) max-content;
	gap: 8px;
	align-items: center;
	border: 1px solid var(--blf-border);
	border-radius: 4px;
	background: #fff8e5;
	padding: 8px 10px;
}

.blf-raw-override code {
	white-space: pre-wrap;
	word-break: break-word;
}

.blf-container {
	min-width: 0;
}

.blf-container-title {
	font-weight: 700;
	margin: 0 0 8px;
}

.blf-container-list {
	display: grid;
	gap: 14px;
	min-width: 0;
	align-content: start;
}

.blf-container.blf-columns > .blf-container-list {
	grid-template-columns: minmax(0, 1.25fr) minmax(280px, 0.75fr);
	align-items: start;
}

.blf-container > .tab-content {
	min-width: 0;
}

.blf-container.small-tabs > .tab-content > .tab-pane > .blf-container > .blf-container-list {
	max-height: 385px;
	overflow: auto;
	overflow-x: hidden;
	padding-right: 4px;
}

.blf-choice label {
	display: inline-flex;
	gap: 6px;
	align-items: center;
	font-weight: 400;
}

.blf-dual-input {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.blf-segmented {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 0;
}

.blf-segmented button {
	border: 1px solid var(--blf-border);
	background: #fff;
	padding: 6px 10px;
	margin-left: -1px;
	cursor: pointer;
}

.blf-segmented button:first-child {
	border-radius: 4px 0 0 4px;
	margin-left: 0;
}

.blf-segmented button:last-child {
	border-radius: 0 4px 4px 0;
}

.blf-segmented button.active {
	background: var(--blf-accent);
	border-color: var(--blf-accent);
	color: #fff;
	z-index: 1;
}

@media (max-width: 760px) {
	.blf-container.blf-columns > .blf-container-list {
		grid-template-columns: 1fr;
	}
}
</style>
