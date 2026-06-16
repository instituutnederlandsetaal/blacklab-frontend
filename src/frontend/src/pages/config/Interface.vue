<template>
	<div>
		The interface configuration page! Currently in corpus {{ index.id }}

		<div>
			<ul class="nav nav-tabs">
				<li :class="{ active: activePattern === 'simple' }" @click.prevent="activePattern = 'simple'"><a href="#simple" class="querytype">Simple</a></li>
				<li :class="{ active: activePattern === 'extended' }" @click.prevent="activePattern = 'extended'"><a href="#extended" class="querytype">Extended</a></li>
				<li :class="{ active: activePattern === 'advanced' }" @click.prevent="activePattern = 'advanced'" v-if="advancedEnabled"><a href="#advanced" class="querytype">Advanced</a></li>
				<li :class="{ active: activePattern === 'expert' }" @click.prevent="activePattern = 'expert'"><a href="#expert" class="querytype">Expert</a></li>
			</ul>
		</div>

		<div class="tab-content">
			<div class="tab-pane" :class="{ active: (activePattern = 'simple') }">
				<label>Annotation to search here: </label>
				<SelectPicker :options="forwardIndexAnnotations" allowHtml data-menu-width="grow" hideEmpty />
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import type { PropType } from 'vue';

import type { NormalizedAnnotation, NormalizedIndex } from '@/types/apptypes';
import type { Option } from '@/utils/options';

import SelectPicker from '@/components/SelectPicker.vue';

const component = defineComponent({
	components: {
		SelectPicker,
	},
	props: {
		index: { type: Object as PropType<NormalizedIndex>, required: true },
	},
	data: () => ({
		activePattern: '',
		advancedEnabled: true,
	}),
	computed: {
		annotationArray(): NormalizedAnnotation[] {
			return Object.values(this.index.annotatedFields)
				.flatMap(f => Object.values(f.annotations))
				.sort((a, b) => a.defaultDisplayName.localeCompare(b.defaultDisplayName));
		},
		forwardIndexAnnotations(): Option[] {
			return Object.values(this.index.annotatedFields)
				.flatMap(f => Object.values(f.annotations))
				.sort((a, b) => a.defaultDisplayName.localeCompare(b.defaultDisplayName))
				.map<Option>(a => ({
					value: a.id,
					label: `${a.defaultDisplayName} [<strong>${a.id}</strong>] ${a.hasForwardIndex ? '' : '<small>(no forward index)</small>'}`,
					disabled: !a.hasForwardIndex,
				}));
		},
		allAnnotations(): Option[] {
			return Object.values(this.index.annotatedFields)
				.flatMap(f => Object.values(f.annotations))
				.sort((a, b) => a.defaultDisplayName.localeCompare(b.defaultDisplayName))
				.map<Option>(a => ({
					value: a.id,
					label: `${a.defaultDisplayName} [<strong>${a.id}</strong>]}`,
				}));
		},
	},
	methods: {},
});

export default component;
export const step = component;
</script>
