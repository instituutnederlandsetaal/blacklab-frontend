<template>
	<div class="panel panel-primary bl-token" :id="localToken.id">
		<!-- Token Header -->
		<div class="panel-heading">
			<button 
				v-if="canMoveLeft"
				type="button" 
				class="btn btn-xs btn-default"
				:title="$t('search.advanced.queryBuilder.token_head_move_left_title').toString()"
				@click="$emit('move-token-left', localToken.id)"
			>
				<span class="glyphicon glyphicon-chevron-left"></span>
			</button>
			<button 
				v-if="canMoveRight"
				type="button" 
				class="btn btn-xs btn-default"
				:title="$t('search.advanced.queryBuilder.token_head_move_right_title').toString()"
				@click="$emit('move-token-right', localToken.id)"
			>
				<span class="glyphicon glyphicon-chevron-right"></span>
			</button>
		
			<!-- CQL Preview -->
			<span :id="localToken.id + '_cql_preview'" class="bl-token-cql-preview">{{ tokenCql }}</span>
			
			<!-- Delete Button -->
			<button 
				type="button" 
				class="close" 
				area-label="delete" 
				:title="$t('search.advanced.queryBuilder.token_head_deleteButton_title').toString()"
				@click="$emit('delete-token', localToken.id)"
			>
				<span aria-hidden="true">&times;</span>
			</button>
			
		</div>

		<!-- Token Body -->
		<div class="panel-body" :id="localToken.id + '_panel_body'">
			<!-- Tabs -->
			<ul class="nav nav-tabs">
				<li :class="{ active: activeTab === 'attributes' }">
					<a role="button" @click="activeTab = 'attributes'">{{ $t('search.advanced.queryBuilder.body_tab_header_search') }}</a>
				</li>
				<li :class="{ active: activeTab === 'properties' }">
					<a role="button" @click="activeTab = 'properties'">{{ $t('search.advanced.queryBuilder.body_tab_header_properties') }}</a>
				</li>
			</ul>

			<!-- Tab Content -->
			<div class="tab-content">
				<!-- Attributes Tab -->
				<div 
					:id="localToken.id + '_tab_attributes'"
					class="tab-pane"
					:class="{ active: activeTab === 'attributes' }"
					style="padding: 25px 15px;"
				>
					<CqlAttributeGroup
						:group="localToken.rootAttributeGroup"
						:annotations="annotations"
						:comparators="comparators"
						:operators="operators"
						:text-direction="textDirection"
						:get-cql-fn="getCqlFn"
						:is-root="true"
						@update:group="updateRootAttributeGroup"
					/>
				</div>

				<!-- Properties Tab -->
				<div 
					:id="localToken.id + '_tab_properties'"
					class="tab-pane"
					:class="{ active: activeTab === 'properties' }"
					style="padding: 10px 15px 25px 15px;"
				>
					<div class="checkbox">
						<label :title="$t('search.advanced.queryBuilder.body_tab_properties_optional_title').toString()">
							<input 
								type="checkbox" 
								:id="localToken.id + '_property_optional'"
								v-model="localToken.properties.optional"
								@change="emitUpdate"
							>
							{{ $t('search.advanced.queryBuilder.body_tab_properties_optional') }}
						</label>
					</div>
					<div class="checkbox">
						<label :title="$t('search.advanced.queryBuilder.body_tab_properties_beginOfSentence_title').toString()">
							<input 
								type="checkbox" 
								:id="localToken.id + '_property_sentence_start'"
								v-model="localToken.properties.beginOfSentence"
								@change="emitUpdate"
							>
							{{ $t('search.advanced.queryBuilder.body_tab_properties_beginOfSentence') }}
						</label>
					</div>
					<div class="checkbox">
						<label :title="$t('search.advanced.queryBuilder.body_tab_properties_endOfSentence_title').toString()">
							<input 
								type="checkbox" 
								:id="localToken.id + '_property_sentence_end'"
								v-model="localToken.properties.endOfSentence"
								@change="emitUpdate"
							>
							{{ $t('search.advanced.queryBuilder.body_tab_properties_endOfSentence') }}
						</label>
					</div>
					<div class="input-group" style="width:318px;">
						<span class="input-group-addon">{{ $t('search.advanced.queryBuilder.body_tab_properties_repeats_label') }}</span>
						<input 
							type="text" 
							class="form-control" 
							:id="localToken.id + '_property_repeats_min'"
							v-model.number="localToken.properties.minRepeats"
							@change="emitUpdate"
						>
						<span class="input-group-addon" style="border-left-width:0px; border-right-width:0px;">
							{{ $t('search.advanced.queryBuilder.body_tab_properties_repeats_to') }}
						</span>
						<input 
							type="text" 
							class="form-control" 
							:id="localToken.id + '_property_repeats_max'"
							v-model.number="localToken.properties.maxRepeats"
							@change="emitUpdate"
						>
						<span class="input-group-addon">{{ $t('search.advanced.queryBuilder.body_tab_properties_repeats_times') }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import Vue from 'vue';
import { NormalizedAnnotation } from '@/types/apptypes';
import {
	CqlTokenData,
	CqlComparator,
	CqlOperator,
	CqlAttributeGroupData,
	CqlAttributeData,
	CqlGroupEntry,
	isCqlAttributeData,
	isCqlAttributeGroupData,
	CqlGenerator
} from '@/components/cql/cql-types';
import CqlAttributeGroup from './CqlAttributeGroup.vue';

export default Vue.extend({
	components: {
		CqlAttributeGroup
	},
	props: {
		token: { type: Object as () => CqlTokenData, required: true },
		canMoveLeft: { type: Boolean, default: false },
		canMoveRight: { type: Boolean, default: false },
	},
	data() {
		return {
			activeTab: 'attributes' as 'attributes' | 'properties',
			localToken: JSON.parse(JSON.stringify(this.token))
		};
	},
	computed: {
		tokenCql(): string {
			return this.generateTokenCql(this.localToken);
		}
	},
	watch: {
		token: {
			deep: true,
			immediate: true,
			handler() {
				this.localToken = this.createLocalToken();
			}
		}
	},
	methods: {
		createLocalToken(): CqlTokenData {
			// Deep clone the token to avoid mutating the original
			return JSON.parse(JSON.stringify(this.token));
		},

		updateRootAttributeGroup(updatedGroup: CqlAttributeGroupData) {
			this.localToken.rootAttributeGroup = updatedGroup;
			this.emitUpdate();
		},

		emitUpdate() {
			this.$emit('update:token', this.localToken);
		},

		generateTokenCql(token: CqlTokenData): string { return CqlGenerator.tokenCql(token); },
	}
});
</script>

<style lang="scss">
/* Using original CSS classes from cql_querybuilder.scss - no additional styles needed */

.bl-token {
	min-width: 350px;
	> .panel-heading {
		width: 100%;
		display: flex;
		flex-wrap: nowrap;
		gap: 0.25em;
		.close {
			float: none;
		}
		.bl-token-cql-preview {
			flex-grow: 1;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

}
</style>