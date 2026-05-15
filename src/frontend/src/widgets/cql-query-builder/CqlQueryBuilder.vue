<template>
	<div class="querybuilder bl-querybuilder-root">
		<!-- Tokens Container -->
		<div class="bl-token-container">
			<CqlToken
				v-for="(token, index) in model.tokens"
				:key="token.id"
				:model-value="model.tokens[index]"
				:options="options"
				:can-move-left="index > 0"
				:can-move-right="index < model.tokens.length - 1"
				@update:model-value="model.tokens[index] = $event"
				@delete-token="deleteToken"
				@move-token-left="moveTokenLeft"
				@move-token-right="moveTokenRight"
			/>

			<!-- Add Token Button -->
			<button type="button" class="btn btn-primary bl-token-create" :title="$t('search.advanced.queryBuilder.createTokenButton_label').toString()" @click="addToken">
				<span class="glyphicon glyphicon-plus"></span>
			</button>
		</div>

		<slot name="below"></slot>
	</div>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';
import { options } from 'floating-vue';
import { watch } from 'vue';

import type { CqlQueryBuilderData, CqlQueryBuilderOptions, CqlTokenData } from '@/widgets/cql-query-builder/model';
import { COMPARATORS, OPERATORS } from '@/widgets/cql-query-builder/model';

import useUid from '@/shared/utils/useUid';

import CqlToken from './CqlToken.vue';

const props = defineProps<{
	modelValue: CqlQueryBuilderData;
	options: CqlQueryBuilderOptions;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: CqlQueryBuilderData];
}>();

const model = useVModel(props, 'modelValue', emit, {
	deep: true,
	passive: true,
	clone: true,
});

function addToken() {
	const newToken: CqlTokenData = {
		id: `token_${useUid()}`,
		properties: {
			optional: false,
			minRepeats: 1,
			maxRepeats: 1,
			beginOfSentence: false,
			endOfSentence: false,
		},
		rootAttributeGroup: {
			id: `group_${useUid()}`,
			operator: OPERATORS[0],
			entries: [
				{
					id: `attr_${useUid()}`,
					annotationId: options.value.defaultAnnotationId,
					comparator: COMPARATORS[0][0],
					values: [''],
					caseSensitive: false,
				},
			],
		},
	};

	model.value.tokens.push(newToken);
}

function deleteToken(tokenId: string) {
	const index = model.value.tokens.findIndex(t => t.id === tokenId);
	if (index !== -1) {
		model.value.tokens.splice(index, 1);

		if (model.value.tokens.length === 0) {
			addToken();
		}
	}
}

function moveTokenLeft(tokenId: string) {
	const index = model.value.tokens.findIndex(t => t.id === tokenId);
	if (index > 0) {
		const token = model.value.tokens.splice(index, 1)[0];
		model.value.tokens.splice(index - 1, 0, token);
	}
}

function moveTokenRight(tokenId: string) {
	const index = model.value.tokens.findIndex(t => t.id === tokenId);
	if (index < model.value.tokens.length - 1) {
		const token = model.value.tokens.splice(index, 1)[0];
		model.value.tokens.splice(index + 1, 0, token);
	}
}

watch(
	model,
	() => {
		if (!Array.isArray(model.value.tokens)) {
			model.value.tokens = [];
		}
		if (typeof model.value.within !== 'string') {
			model.value.within = '';
		}
		if (!model.value.tokens.length) {
			addToken();
		}
	},
	{
		deep: true,
		immediate: true,
	},
);
</script>

<style lang="scss">
.bl-querybuilder-root {
	padding: 15px;
	display: flex;
	flex-direction: column;
	gap: 15px;
}

.bl-token-container {
	display: flex;
	flex-direction: row;
	gap: 15px;
	align-items: start;
	overflow-x: auto;
}

.bl-token-create {
	align-self: flex-start;
}

.bl-querybuilder-within {
	display: flex;
	margin: 0;
	flex-direction: row;
	gap: 1em;
	justify-content: flex-start;
	align-items: center;

	> * {
		padding: 0;
		width: auto;
	}
}
</style>
