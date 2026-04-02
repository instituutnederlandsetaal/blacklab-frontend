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
			<button
				type="button"
				class="btn btn-primary bl-token-create"
				:title="$t('search.advanced.queryBuilder.createTokenButton_label').toString()"
				@click="addToken"
			>
				<span class="glyphicon glyphicon-plus"></span>
			</button>
		</div>

		<!-- Within Select -->
		<Within class="bl-querybuilder-within" v-model="model.within"/>
	</div>
</template>

<script setup lang="ts">
import {
	CqlTokenData,
	COMPARATORS,
	OPERATORS,
	CqlQueryBuilderData,
	CqlQueryBuilderOptions,
} from '@/components/cql/cql-types';
import type { NormalizedAnnotation, NormalizedAnnotationGroup } from '@/types/apptypes';
import CqlToken from './CqlToken.vue';
import Within from '@/pages/search/form/Within.vue';
import uid from '@/mixins/uid';
import { computed, watch } from 'vue';
import { useVModel } from '@vueuse/core';

import * as UIStore from '@/store/ui';
import * as CorpusStore from '@/store/corpus';
import i18n from '@/utils/i18n';
import { getAnnotationSubset } from '@/utils';

const props = defineProps<{
	modelValue: CqlQueryBuilderData,
}>();

const emit = defineEmits<{
	'update:modelValue': [value: CqlQueryBuilderData],
}>();

const model = useVModel(props, 'modelValue', emit, {
	deep: true,
	passive: true,
	clone: true,
});

function translateDefault<T extends string | null | undefined>(key: string, defaultText: T): T | string {
	const fallbackLocale = i18n.getFallbackLocale();
	const hasTranslation = i18n.i18n.te(key);

	if (hasTranslation) {
		return i18n.i18n.t(key).toString();
	}

	if (fallbackLocale && i18n.i18n.locale !== fallbackLocale && i18n.i18n.te(key, fallbackLocale)) {
		return i18n.i18n.t(key, fallbackLocale).toString();
	}

	return defaultText;
}

const queryBuilderI18n = {
	$td: translateDefault,
	$tAnnotDisplayName(annotation: Pick<NormalizedAnnotation, 'id' | 'defaultDisplayName'>) {
		return translateDefault(`index.annotations.${annotation.id}`, annotation.defaultDisplayName || annotation.id);
	},
	$tAnnotDescription(annotation: Pick<NormalizedAnnotation, 'id' | 'defaultDescription'>) {
		return translateDefault(`index.annotations.${annotation.id}_description`, annotation.defaultDescription);
	},
	$tAnnotGroupName(group: Pick<NormalizedAnnotationGroup, 'id'>) {
		return translateDefault(`index.annotationGroups.${group.id}`, group.id);
	},
};

const options = computed<CqlQueryBuilderOptions>(() => {
	const indexId = CorpusStore.get.indexId()!;
	const textDirection = CorpusStore.get.textDirection();
	const allAnnotationsMap = CorpusStore.get.allAnnotationsMap();
	const searchAnnotationIds = UIStore.getState().search.advanced.searchAnnotationIds;

	const annotationGroups = getAnnotationSubset(
		searchAnnotationIds,
		CorpusStore.get.annotationGroups(),
		allAnnotationsMap,
		'Search',
		queryBuilderI18n as any,
		textDirection,
		false,
		false
	);

	const annotationOptions = (annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(g => g.options)) as any;

	return {
		indexId,
		defaultAnnotationId: UIStore.getState().search.advanced.defaultSearchAnnotationId,
		textDirection,
		allAnnotationsMap,
		annotationOptions,
		operatorOptions: OPERATORS.map(op => ({
			label: translateDefault(`search.advanced.queryBuilder.boolean_operators.${op}`, op),
			value: op,
		})),
		comparatorOptions: COMPARATORS.map(comp => ({
			label: '',
			options: comp.map(comp => ({
				label: translateDefault(`search.advanced.queryBuilder.comparators.${comp}`, comp),
				value: comp,
			})),
		})),
	};
});

function addToken() {
	const newToken: CqlTokenData = {
		id: `token_${uid()}`,
		properties: {
			optional: false,
			minRepeats: 1,
			maxRepeats: 1,
			beginOfSentence: false,
			endOfSentence: false,
		},
		rootAttributeGroup: {
			id: `group_${uid()}`,
			operator: OPERATORS[0],
			entries: [{
				id: `attr_${uid()}`,
				annotationId: options.value.defaultAnnotationId,
				comparator: COMPARATORS[0][0],
				values: [''],
				caseSensitive: false,
			}],
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

watch(model, () => {
	if (!Array.isArray(model.value.tokens)) {
		model.value.tokens = [];
	}
	if (typeof model.value.within !== 'string') {
		model.value.within = '';
	}
	if (!model.value.tokens.length) {
		addToken();
	}
}, {
	deep: true,
	immediate: true,
});
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
