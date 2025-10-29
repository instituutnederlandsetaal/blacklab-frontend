<template>
	<div class="querybuilder bl-querybuilder-root">
		<!-- Tokens Container -->
		<div class="bl-token-container">
			<CqlToken
				v-for="(token, index) in model.tokens" v-model="model.tokens[index]"
				:key="token.id"
				:options="options"

				:can-move-left="index > 0"
				:can-move-right="index < model.tokens.length - 1"

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
		<Within class="bl-querybuilder-within" v-model="value.within"/>
	</div>
</template>

<script lang="ts">
import {
	CqlTokenData,
	COMPARATORS,
	OPERATORS,
	CqlQueryBuilderData,
	CqlQueryBuilderOptions,
} from '@/components/cql/cql-types';
import CqlToken from './CqlToken.vue';
import Modal from '@/components/Modal.vue';
import Within from '@/pages/search/form/Within.vue';
import uid from '@/mixins/uid';

import * as UIStore from '@/store/search/ui';
import * as CorpusStore from '@/store/search/corpus';
import { getAnnotationSubset } from '@/utils';

import useModel from './useModel';

export default useModel<CqlQueryBuilderData>().extend({
	components: {
		CqlToken,
		Modal,
		Within
	},
	computed: {
		options(): CqlQueryBuilderOptions {
			return this.createCqlQueryBuilderOptions();
		},
	},
	methods: {
		createCqlQueryBuilderOptions(): CqlQueryBuilderOptions {
			const textDirection = CorpusStore.get.textDirection();
			const allAnnotationsMap = CorpusStore.get.allAnnotationsMap();
			const searchAnnotationIds = UIStore.getState().search.advanced.searchAnnotationIds;

			const annotationGroups = getAnnotationSubset(
				searchAnnotationIds,
				CorpusStore.get.annotationGroups(),
				allAnnotationsMap,
				'Search',
				this,
				textDirection,
				false,
				false
			);

			const annotationOptions = (annotationGroups.length > 1 ? annotationGroups : annotationGroups.flatMap(g => g.options)) as any;

			return {
				defaultAnnotationId: UIStore.getState().search.advanced.defaultSearchAnnotationId,
				textDirection,
				allAnnotationsMap,
				annotationOptions,
				operatorOptions: OPERATORS.map(op => ({
					label: this.$td(`search.advanced.queryBuilder.boolean_operators.${op}`, op),
					value: op,
				})),
				comparatorOptions: COMPARATORS.map(comp => ({
					label: '',
					options: comp.map(comp => ({
						label: this.$td(`search.advanced.queryBuilder.comparators.${comp}`, comp),
						value: comp,
					})),
				}))
			};
		},

		addToken() {
			const newToken: CqlTokenData = {
				id: `token_${uid()}`,
				properties: {
					optional: false,
					minRepeats: 1,
					maxRepeats: 1,
					beginOfSentence: false,
					endOfSentence: false
				},
				rootAttributeGroup: {
					id: `group_${uid()}`,
					operator: OPERATORS[0],
					entries: [{
						id: `attr_${uid()}`,
						annotationId: this.options.defaultAnnotationId,
						comparator: COMPARATORS[0][0],
						values: [''],
						caseSensitive: false
					}]
				}
			};

			this.model.tokens.push(newToken);
		},

		updateToken(updatedToken: CqlTokenData) {
			const index = this.model.tokens.findIndex(t => t.id === updatedToken.id);
			if (index !== -1) {
				this.$set(this.model.tokens, index, updatedToken);
			}
		},

		deleteToken(tokenId: string) {
			const index = this.model.tokens.findIndex(t => t.id === tokenId);
			if (index !== -1) {
				this.model.tokens.splice(index, 1);

				// Ensure at least one token exists
				if (this.model.tokens.length === 0) {
					this.addToken();
				}
			}
		},

		moveTokenLeft(tokenId: string) {
			const index = this.model.tokens.findIndex(t => t.id === tokenId);
			if (index > 0) {
				const token = this.model.tokens.splice(index, 1)[0];
				this.model.tokens.splice(index - 1, 0, token);
			}
		},

		moveTokenRight(tokenId: string) {
			const index = this.model.tokens.findIndex(t => t.id === tokenId);
			if (index < this.model.tokens.length - 1) {
				const token = this.model.tokens.splice(index, 1)[0];
				this.model.tokens.splice(index + 1, 0, token);
			}
		},
	},
	watch: {
		model: {
			// Create initial token if none exist
			handler() {
				if (!this.model.tokens.length) {
					this.addToken();
				}
			},
			deep: true,
			immediate: true,
		}
	}
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
