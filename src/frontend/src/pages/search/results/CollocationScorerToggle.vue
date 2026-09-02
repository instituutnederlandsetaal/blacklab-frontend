<template>
	<div class="collocation-scorer">
		<span>{{ $t('collocations.scorer') }}:</span>
		<div class="btn-group" role="group" :aria-label="$t('collocations.scorer').toString()">
			<button
				v-for="option in options"
				:key="option.value"
				type="button"
				class="btn btn-default btn-sm"
				:class="{ active: model === option.value }"
				:disabled
				:aria-pressed="model === option.value"
				@click="model = option.value"
			>
				{{ option.label }}
			</button>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { BLCollocationScorer } from '@/types/blacklabtypes';

import { useI18n } from '@/shared/i18n';

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
const model = defineModel<BLCollocationScorer>({ required: true });
const translate = useI18n();
const options = computed<Array<{ value: BLCollocationScorer; label: string }>>(() => [
	{ value: 'coll-dice', label: translate.$t('collocations.scorers.dice').toString() },
	{ value: 'coll-salience', label: translate.$t('collocations.scorers.salience').toString() },
]);
</script>

<style lang="scss" scoped>
.collocation-scorer {
	display: flex;
	align-items: center;
	gap: 6px;
}
</style>
