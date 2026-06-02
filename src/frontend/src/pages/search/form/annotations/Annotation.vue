<template>
	<div :class="bare ? '' : 'form-group propertyfield'" :id="htmlId">
		<!-- behaves as .row when in .form-horizontal so .row may be omitted -->
		<label v-if="!bare" :for="inputId" class="col-xs-12 col-md-3" :title="description"
			>{{ displayName }} <Debug>(id: {{ annotation.id }})</Debug></label
		>
		<div :class="bare ? '' : 'col-xs-12 col-md-9'">
			<SelectPicker
				v-if="annotation.uiType === 'select'"
				data-width="100%"
				container="body"
				:placeholder="displayName"
				:data-id="inputId"
				:data-name="inputId"
				:data-dir="textDirection"
				:options="options"
				v-model="value"
			/>
			<!-- <Lexicon v-else-if="annotation.uiType === 'lexicon'" :annotationId="annotation.id" :definition="annotation" v-model="value" ref="reset" /> -->
			<div v-else :class="bare ? undefined : 'input-group'">
				<Autocomplete
					useQuoteAsWordBoundary
					:id="inputId"
					:name="inputId"
					:placeholder="displayName"
					:disabled="annotation.uiType === 'pos'"
					:dir="textDirection"
					:autocomplete="autocomplete"
					:getData="autocompleteFn"
					v-model="value"
				/>
				<div v-if="!bare" class="input-group-btn">
					<button v-if="annotation.uiType === 'pos'" class="btn btn-default" type="button" @click="posOpen = true">
						<span class="fa fa-pencil fa-fw"></span>
					</button>

					<label class="btn btn-default file-input-button" :for="fileInputId" v-if="annotation.uiType !== 'pos'">
						<span class="fa fa-upload fa-fw"></span>
						<input type="file" title="Upload a list of values" :id="fileInputId" @change="onFileChanged" />
					</label>
				</div>
			</div>

			<!-- Don't destroy the component on close, it keeps some state. -->
			<!-- <PartOfSpeech v-if="annotation.uiType === 'pos'" :open="posOpen" @close="posOpen = false" :id="`pos_editor${uid}`" :annotation="annotation" @submit="value = $event" ref="reset" /> -->

			<div v-if="annotation.caseSensitive && !bare && annotation.uiType !== 'pos'" class="checkbox">
				<label :for="caseInputId">
					<input type="checkbox" :id="caseInputId" :name="caseInputId" v-model="caseSensitive" />
					{{ $t('annotation.caseSensitive') }}
				</label>
			</div>
		</div>
		<div v-if="!bare && description" :class="bare ? '' : 'col-xs-12 col-md-push-3 col-md-9'">
			<small class="text-muted">
				<em>{{ description }}</em>
			</small>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import * as CorpusStore from '@/entities/corpus/model/legacy-corpus-store';
import * as PatternStore from '@/pages/search/form/store/pattern-store';
import type { NormalizedAnnotation } from '@/types/apptypes';

import { useBlackLabApi } from '@/shared/api/useApi';
import { useI18n } from '@/shared/i18n';
import type { Option } from '@/shared/utils/options';
import useUid from '@/shared/utils/useUid';

import Autocomplete from '@/shared/ui/Autocomplete.vue';
import SelectPicker from '@/shared/ui/SelectPicker.vue';

const props = defineProps<{
	annotation: NormalizedAnnotation;
	htmlId: string;
	bare?: boolean;
	/**
	 * Set to true if this annotation is the "simple" annotation. I.e. the Annotation in the "simple" tab of the search form.
	 * This will change which field the value is written to the vuex store.
	 */
	simple?: boolean;
}>();

const blacklab = useBlackLabApi();
const translate = useI18n();

const uid = useUid();
const posOpen = ref(false);

const caseSensitive = computed<boolean>({
	get() {
		if (props.simple) return PatternStore.get.simple().annotationValue.case;
		return PatternStore.get.annotationValue(props.annotation.annotatedFieldId, props.annotation.id).case;
	},
	set(caseSensitive: boolean) {
		if (props.simple) {
			PatternStore.actions.simple.annotation({
				id: props.annotation.id,
				case: caseSensitive,
			});
		} else {
			PatternStore.actions.extended.annotation({
				id: props.annotation.id,
				case: caseSensitive,
			});
		}
	},
});
const value = computed<string>({
	get(): string {
		if (props.simple) return PatternStore.get.simple().annotationValue.value;
		else return PatternStore.get.annotationValue(props.annotation.annotatedFieldId, props.annotation.id).value;
	},
	set(value: string) {
		if (props.simple) {
			PatternStore.actions.simple.annotation({
				id: props.annotation.id,
				value,
			});
		} else {
			PatternStore.actions.extended.annotation({
				id: props.annotation.id,
				value,
			});
		}
	},
});

const textDirection = computed<string | undefined>(() => (props.annotation.isMainAnnotation ? CorpusStore.get.textDirection() : undefined));
const inputId = computed(() => props.htmlId + '_value');
const fileInputId = computed(() => props.htmlId + '_file');
const caseInputId = computed(() => props.htmlId + '_case');
const displayName = computed(() => translate.$tAnnotDisplayName(props.annotation));
const description = computed(() => translate.$tAnnotDescription(props.annotation));
const options = computed<Option[]>(() => props.annotation.values || []);
const autocomplete = computed(() => props.annotation.uiType === 'combobox' && props.annotation.annotatedFieldId !== '');
function autocompleteFn(term: string): Promise<string[]> {
	if (!props.annotation.annotatedFieldId) return Promise.resolve([]);
	return blacklab.getTermAutocomplete(CorpusStore.get.indexId(), props.annotation.annotatedFieldId, props.annotation.id, term);
}

function onFileChanged(event: Event) {
	const fileInput = event.target as HTMLInputElement;
	const file = fileInput.files && fileInput.files[0];
	if (file != null) {
		const fr = new FileReader();
		fr.onload = () => {
			// Replace all whitespace with pipes,
			// Same as the querybuilder wordlist upload
			value.value = (fr.result as string).trim().replace(/\s+/g, '|');
		};
		fr.readAsText(file);
	} else {
		value.value = '';
	}
	(event.target as HTMLInputElement).value = '';
}

// void Lexicon; // eslint wants to make this a type import? not correct.
// const lexicon = useTemplateRef<InstanceType<typeof Lexicon>>('reset');

// watch(
// 	() => PatternStore.resetSignal,
// 	_ => lexicon.value?.reset(),
// );
</script>

<style lang="scss"></style>
