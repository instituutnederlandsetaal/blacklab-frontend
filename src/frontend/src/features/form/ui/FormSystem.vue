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
import type { CompiledFormResult } from '@/features/form/model/types/form-result';

import { provideFormSystemRuntime } from '../model/runtime';

const props = defineProps<{
	runtime: FormRuntime;
	rootId?: string;
}>();

const attrs = useAttrs();

const emit = defineEmits<{
	submit: [snapshot: CompiledFormResult];
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

const renderTree = computed(() => props.runtime.renderableGraph(props.rootId));

const activeOverrides = computed(() =>
	Object.entries(props.runtime.state.rawOverrides.value)
		.filter(([, value]) => value !== undefined)
		.map(([parameter, value]) => ({ parameter, value, label: `Restored ${parameter}` })),
);
</script>

<style lang="scss">
.blf-form-system {
	--blf-border: #ccc;
	--blf-border-strong: #adadad;
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

.blf-dual-input {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}
</style>
