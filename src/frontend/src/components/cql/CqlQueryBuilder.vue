<template>
	<div class="querybuilder bl-querybuilder-root">
		<!-- Tokens Container -->
		<div class="bl-token-container">
			<CqlToken
				v-for="(token, index) in tokens"
				:key="token.id"
				:token="token"
				:annotations="options.annotations"
				:comparators="comparators"
				:operators="operators"
				:text-direction="textDirection"
				:can-move-left="index > 0"
				:can-move-right="index < tokens.length - 1"
				:get-cql-fn="getCqlFn"
				@update:token="updateToken"
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
		
		<!-- Modal Editor -->
		<Modal 
			v-if="showModalEditor"
			:title="$t('search.advanced.queryBuilder.modalEditor_title')"
			@close="closeModalEditor"
		>
			<template #body>
				<textarea 
					v-model="modalEditorValue"
					class="form-control" 
					rows="10" 
					style="width:100%;overflow:auto;resize:none;white-space:pre;"
				></textarea>
			</template>
			<template #footer>
				<button 
					type="button" 
					class="btn btn-primary pull-left" 
					@click="clearModalEditor"
				>
					{{ $t('search.advanced.queryBuilder.modalEditor_clear') }}
				</button>
				<button 
					type="button" 
					class="btn btn-default" 
					@click="closeModalEditor"
				>
					{{ $t('search.advanced.queryBuilder.modalEditor_cancel') }}
				</button>
				<button 
					type="button" 
					class="btn btn-primary" 
					@click="saveModalEditor"
				>
					{{ $t('search.advanced.queryBuilder.modalEditor_save') }}
				</button>
			</template>
		</Modal>
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

export default useModel<CqlQueryBuilderData>().extend({
	components: {
		CqlToken,
		Modal,
		Within
	},
	props: {
		options: {
			type: Object as () => CqlQueryBuilderOptions,
			required: true,
		},
	},
	mounted() {
		// Create initial token if none exist
		if (this.model.tokens.length === 0) {
			this.addToken();
		}
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
						annotationId: this.defaultAnnotation,
						operator: '=',
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
