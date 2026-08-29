<template>
	<div>
		The interface configuration page! Currently in corpus {{ index.id }}

		<div>
			<ul class="nav nav-tabs">
				<li :class="{ active: activePattern === 'simple' }" @click.prevent="activePattern = 'simple'"><a href="#simple" class="querytype">Simple</a></li>
				<li :class="{ active: activePattern === 'extended' }" @click.prevent="activePattern = 'extended'"><a href="#extended" class="querytype">Extended</a></li>
				<li :class="{ active: activePattern === 'advanced' }" @click.prevent="activePattern = 'advanced'"><a href="#advanced" class="querytype">Advanced</a></li>
				<li :class="{ active: activePattern === 'expert' }" @click.prevent="activePattern = 'expert'"><a href="#expert" class="querytype">Expert</a></li>
			</ul>
		</div>

		<div class="tab-content">
			<div class="tab-pane" :class="{ active: activePattern === 'simple' }">
				<label>Annotation to search here: </label>
				<SelectPicker :options="forwardIndexAnnotations" allowHtml data-menu-width="grow" hideEmpty />
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import type { NormalizedIndex } from '@/types/apptypes';

import type { Option } from '@/shared/utils/options';

import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<{ index: NormalizedIndex }>();
const activePattern = ref<'simple' | 'extended' | 'advanced' | 'expert'>('simple');
const forwardIndexAnnotations = computed<Option[]>(() =>
	Object.values(props.index.annotatedFields)
		.flatMap(f => Object.values(f.annotations))
		.sort((a, b) => a.defaultDisplayName.localeCompare(b.defaultDisplayName))
		.map(a => ({
			value: a.id,
			label: `${a.defaultDisplayName} [<strong>${a.id}</strong>] ${a.hasForwardIndex ? '' : '<small>(no forward index)</small>'}`,
			disabled: !a.hasForwardIndex,
		})),
);
</script>
