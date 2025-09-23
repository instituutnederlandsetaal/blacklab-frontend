<template>
	<div class="querybuilder bl-querybuilder-root">
		<!-- Tokens Container -->
		<div class="bl-token-container">
			<CqlToken
				v-for="(token, index) in model.tokens" v-model="model.tokens[index]"
				:key="token.id"

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
		<Within class="clearfix" v-model="value.within"/>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import {
	CqlTokenData,
	CqlAttributeGroupData,
	CqlAttributeData,
	CqlComparator,
	CqlOperator,
	isCqlAttributeData,
	isCqlAttributeGroupData,
	DEFAULT_COMPARATORS,
	DEFAULT_OPERATORS,
	DEFAULT_CQL_GENERATOR,
	CqlQueryBuilderData,
	CqlGenerator
} from '@/components/cql/cql-types';
import CqlToken from './CqlToken.vue';
import Modal from '@/components/Modal.vue';
import Within from '@/pages/search/form/Within.vue';
import uid from '@/mixins/uid';


import * as UIStore from '@/store/search/ui';
import * as CorpusStore from '@/store/search/corpus';

import useModel from './useModel';
import { using } from 'rxjs';

export default useModel<CqlQueryBuilderData>().extend({
	components: {
		CqlToken,
		Modal,
		Within
	},
	mounted() {
		// Create initial token if none exist
		if (this.model.tokens.length === 0) {
			this.addToken();
		}
	},
	computed: {
		defaultAnnotationId() { return UIStore.getState().search.advanced.defaultSearchAnnotationId },
	},
	methods: {
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
					operator: '&',
					entries: [{
						id: `attr_${uid()}`,
						annotationId: this.defaultAnnotationId,
						operator: DEFAULT_OPERATORS[0].operator,
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
});
</script>
