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

		<!-- Within Select -->
		<Within class="bl-querybuilder-within" v-model="model.within" />
	</div>
</template>

<script setup lang="ts">
import { useVModel } from '@vueuse/core';
import { computed, watch } from 'vue';

import * as UIStore from '@/app/state/ui-state';
import type { CqlQueryBuilderData, CqlQueryBuilderOptions, CqlTokenData } from '@/components/cql/cql-types';
import { COMPARATORS, OPERATORS } from '@/components/cql/cql-types';
import * as CorpusStore from '@/features/corpus/model/corpus-state.ts';
import { getAnnotationSubset } from '@/utils';

import { useI18n } from '@/shared/i18n/';
import useUid from '@/shared/utils/uid.ts';

import CqlToken from './CqlToken.vue';
import Within from '@/pages/search/form/Within.vue';

const props = defineProps<{
	modelValue: CqlQueryBuilderData;
}>();

const emit = defineEmits<{
	'update:modelValue': [value: CqlQueryBuilderData];
}>();

const model = useVModel(props, 'modelValue', emit, {
	deep: true,
	passive: true,
	clone: true,
});

const translate = useI18n();

const options = computed<CqlQueryBuilderOptions>(() => {
	const indexId = CorpusStore.get.indexId()!;
	const textDirection = CorpusStore.get.textDirection();
	const allAnnotationsMap = CorpusStore.get.allAnnotationsMap();
	const searchAnnotationIds = UIStore.getState().search.advanced.searchAnnotationIds;

	const annotationGroups = getAnnotationSubset(searchAnnotationIds, CorpusStore.get.annotationGroups(), allAnnotationsMap, 'Search', translate, textDirection, false, false);

	const annotationOptions = (annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(g => g.options)) as any;

	return {
		indexId,
		defaultAnnotationId: UIStore.getState().search.advanced.defaultSearchAnnotationId,
		textDirection,
		allAnnotationsMap,
		annotationOptions,
		operatorOptions: OPERATORS.map(op => ({
			label: translate.$td(`search.advanced.queryBuilder.boolean_operators.${op}`, op),
			value: op,
		})),
		comparatorOptions: COMPARATORS.map(comp => ({
			label: '',
			options: comp.map(comp => ({
				label: translate.$td(`search.advanced.queryBuilder.comparators.${comp}`, comp),
				value: comp,
			})),
		})),
	};
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
