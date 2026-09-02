import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { computed, ref } from 'vue';

import { COMPARATORS, createDefaultCqlQueryBuilderData, OPERATORS, type CqlAttributeData, type CqlQueryBuilderOptions } from '@/features/cql-query-builder/model';
import {
	annotationTextController,
	collocationController,
	createCollocationTarget,
	createFormFieldNode,
	expertQueryController,
	FormBuilder,
	FormRuntime,
	queryBuilderController,
	type FormRuntimeContext,
} from '@/features/form';
import type { CollocationFieldState } from '@/features/form/fields/collocation-field';
import type { TokenSequenceCreateField } from '@/features/form/fields/token-sequence-field';
import type { DisplaySettingsForRendering } from '@/pages/search/results/table/table-layout';
import { makeColumns, makeRows } from '@/pages/search/results/table/table-layout';
import type { NormalizedAnnotatedField, NormalizedAnnotation } from '@/types/apptypes';
import type { BLCollocationScorer, BLCollocationsParameters, BLHitGroupResults, BLSearchSummaryV5 } from '@/types/blacklabtypes';

import { useI18n, type Translate } from '@/shared/i18n';

import CollocationField from '../fields/CollocationField.vue';
import TextField from '../fields/generic/TextField.vue';
import QueryBuilderField from '../fields/QueryBuilderField.vue';
import RawCqlField from '../fields/RawCqlField.vue';
import ContainerRenderer from '../ui/ContainerRenderer.vue';
import HeadingView from '../views/HeadingView.vue';
import FormSystemStoryHarness from './FormSystemStoryHarness.vue';
import CollocationScorerToggle from '@/pages/search/results/CollocationScorerToggle.vue';
import GenericTable from '@/pages/search/results/table/GenericTable.vue';

const meta = {
	title: 'Features/Form/Collocations',
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const annotations = Object.fromEntries(
	[
		{ id: 'word', defaultDisplayName: 'Word', caseSensitive: true },
		{ id: 'lemma', defaultDisplayName: 'Lemma', caseSensitive: true },
		{ id: 'pos', defaultDisplayName: 'Part of speech', caseSensitive: false },
	].map((annotation): [string, NormalizedAnnotation] => [
		annotation.id,
		{
			...annotation,
			annotatedFieldId: 'contents',
			defaultDescription: '',
			hasForwardIndex: true,
			isInternal: false,
			isMainAnnotation: annotation.id === 'word',
			offsetsAlternative: '',
			uiType: annotation.id === 'pos' ? 'select' : 'combobox',
			values:
				annotation.id === 'pos'
					? [
							{ value: 'NOUN', label: 'Noun', title: null },
							{ value: 'ADJ', label: 'Adjective', title: null },
							{ value: 'VERB', label: 'Verb', title: null },
						]
					: undefined,
		},
	]),
);

const sourceField: NormalizedAnnotatedField = {
	id: 'contents',
	annotations,
	defaultDescription: '',
	defaultDisplayName: 'Contents',
	hasContentStore: true,
	hasLengthTokens: true,
	hasXmlTags: true,
	isAnnotatedField: true,
	isParallel: false,
	mainAnnotationId: 'word',
};

function createQueryBuilderOptions(translate: Translate): CqlQueryBuilderOptions {
	return {
		indexId: 'storybook-collocations',
		defaultAnnotationId: 'word',
		textDirection: 'ltr',
		allAnnotationsMap: annotations,
		annotationOptions: Object.values(annotations).map(annotation => ({
			value: annotation.id,
			label: () => annotation.defaultDisplayName,
		})),
		operatorOptions: OPERATORS.map(operator => ({
			value: operator,
			label: () => translate.$t(`search.advanced.queryBuilder.boolean_operators.${operator}`).toString(),
		})),
		comparatorOptions: COMPARATORS.map(comparators => ({
			label: '',
			options: comparators.map(comparator => ({
				value: comparator,
				label: () => translate.$t(`search.advanced.queryBuilder.comparators.${comparator}`).toString(),
			})),
		})),
		autocomplete: async (annotation, term) => {
			const examples: Record<string, string[]> = {
				word: ['water', 'waters', 'waterway'],
				lemma: ['water', 'ship', 'trade'],
				pos: ['NOUN', 'ADJ', 'VERB'],
			};
			return (examples[annotation.id] ?? []).filter(value => value.startsWith(term.toLowerCase()));
		},
	};
}

function parseSingleTokenPattern(cql: string) {
	const state = createDefaultCqlQueryBuilderData('word');
	const match = cql.match(/\[\s*([\w-]+)\s*=\s*"(?:\(\?-i\))?([^"]*)"\s*\]/);
	if (!match) return null;
	const attribute = state.tokens[0].rootAttributeGroup.entries[0] as CqlAttributeData;
	attribute.annotationId = match[1];
	attribute.values = [match[2]];
	return state;
}

function createCollocationForm(translate: Translate): FormRuntime {
	const context: FormRuntimeContext = {
		corpus: { indexId: 'storybook-collocations', textDirection: 'ltr' },
		translate,
	};
	const definition = new FormBuilder(context);
	const queryBuilderOptions = createQueryBuilderOptions(translate);
	const advancedField = createFormFieldNode('collocations.story.advanced', queryBuilderController, QueryBuilderField, {
		options: queryBuilderOptions,
	});
	const expertField = createFormFieldNode('collocations.story.expert', expertQueryController, RawCqlField, {
		hideLabel: true,
	});
	const annotationOptions = Object.values(annotations).map(annotation => ({
		value: annotation.id,
		label: () => annotation.defaultDisplayName,
	}));
	const collocations = definition.newField('collocations.story.controls', collocationController, CollocationField, {
		defaultAnnotation: 'word',
		annotationOptions,
		createAnnotationField: ({ id, annotationId, inheritedVariant }: Parameters<TokenSequenceCreateField>[0]) =>
			createFormFieldNode({ id, inheritedVariant }, annotationTextController, TextField, {
				annotationId,
				displayName: annotations[annotationId]?.defaultDisplayName ?? annotationId,
				showLabel: false,
				placeholder: annotationId === 'pos' ? 'e.g. NOUN' : `e.g. ${annotationId === 'lemma' ? 'flow' : 'water'}`,
				caseSensitive: annotations[annotationId]?.caseSensitive ?? false,
			}),
		advancedField,
		expertField,
		withinOptions: [
			{ value: '', label: () => 'Anywhere in the document' },
			{ value: 's', label: () => 'Sentence' },
			{ value: 'p', label: () => 'Paragraph' },
		],
		defaultWithin: 's',
		parsePattern: async (cql: string) => parseSingleTokenPattern(cql),
	});

	definition.newForm('collocations.story', ContainerRenderer, { title: 'Collocation search', target: createCollocationTarget('word') }).addChildren(
		definition.newView('collocations.story.heading', HeadingView, {
			title: () => translate.$t('collocations.heading').toString(),
			description: 'Find the words and constructions that characteristically occur around a keyword.',
		}),
		collocations,
	);

	const runtime = new FormRuntime(definition);
	const state = runtime.state.state.value[collocations.id] as CollocationFieldState;
	state.keyword.simple.fieldState = { value: 'water', caseSensitive: false };
	state.before = 3;
	state.after = 5;
	state.within = 's';
	state.annotation = 'lemma';
	return runtime;
}

export const SearchForm: Story = {
	render: () => ({
		components: { FormSystemStoryHarness },
		setup() {
			return { runtime: createCollocationForm(useI18n()) };
		},
		template: '<FormSystemStoryHarness :runtime />',
	}),
};

function collocationSummary(): BLSearchSummaryV5 {
	const stats = {
		status: 'finished' as const,
		hits: 1248,
		documents: 416,
		timeMs: 82,
		stoppedBecauseTooMany: false,
	};
	return {
		params: { group: 'hit:lemma', first: 0, number: 20, patt: '[lemma="water"]' },
		pattern: { bcql: '[lemma="water"]', fieldName: 'contents' },
		results: {
			window: { firstResult: 0, requestedSize: 20, actualSize: 5, hasPrevious: false, hasNext: true },
			stats: {
				processed: stats,
				counted: stats,
				subcorpusSize: { documents: 12000, tokens: 8_400_000 },
				numberOfGroups: 183,
				largestGroupSize: 164,
			},
			sample: { percentage: undefined, seed: undefined, sample: undefined },
		},
	};
}

function collocationResults(): BLHitGroupResults {
	return {
		hitGroups: [
			{ identity: 'fresh', identityDisplay: 'fresh', size: 164, numberOfDocs: 112, score: 8.42, properties: [{ name: 'hit:lemma', value: 'fresh' }] },
			{ identity: 'drink', identityDisplay: 'drink', size: 137, numberOfDocs: 96, score: 7.91, properties: [{ name: 'hit:lemma', value: 'drink' }] },
			{ identity: 'surface', identityDisplay: 'surface', size: 89, numberOfDocs: 72, score: 6.74, properties: [{ name: 'hit:lemma', value: 'surface' }] },
			{ identity: 'deep', identityDisplay: 'deep', size: 71, numberOfDocs: 61, score: 6.12, properties: [{ name: 'hit:lemma', value: 'deep' }] },
			{ identity: 'flow', identityDisplay: 'flow', size: 54, numberOfDocs: 48, score: 5.83, properties: [{ name: 'hit:lemma', value: 'flow' }] },
		],
		summary: collocationSummary(),
	};
}

function renderingInfo(translate: Translate): DisplaySettingsForRendering {
	return {
		indexId: 'storybook-collocations',
		mainAnnotation: annotations.word,
		otherAnnotations: [],
		detailedAnnotations: [],
		dependencyAnnotations: [],
		dependencyRelationClass: null,
		sortableAnnotations: [],
		annotationGroups: [],
		metadata: [],
		sourceField,
		targetFields: [],
		specialFields: {},
		getSummary: () => '',
		dir: 'ltr',
		html: false,
		i18n: translate,
		groupDisplayMode: 'table',
		hasCustomHitInfoColumn: () => false,
		getCustomHitInfo: () => null,
		getMatchInfoHighlightStyle: () => null,
		requestedRange: null,
		collocationScorer: 'coll-dice',
	};
}

export const ResultsTable: Story = {
	render: () => ({
		components: { CollocationScorerToggle, GenericTable },
		setup() {
			const translate = useI18n();
			const results = collocationResults();
			const scorer = ref<BLCollocationScorer>('coll-dice');
			const info = computed(() => ({ ...renderingInfo(translate), collocationScorer: scorer.value }));
			const cols = computed(() => makeColumns(results, info.value));
			const rows = computed(() => makeRows(results, info.value));
			const sort = ref('-score');
			const scorerLabel = computed(() => translate.$t(`collocations.scorers.${scorer.value === 'coll-salience' ? 'salience' : 'dice'}`).toString());
			const sortStatus = computed(() => {
				const direction = sort.value.startsWith('-') ? 'descending' : 'ascending';
				return `Sorted by ${sort.value.replace(/^-/, '')}, ${direction}`;
			});
			function changeSort(next: string) {
				sort.value = sort.value === next ? `-${next}` : next;
			}
			const query = computed(
				() =>
					({
						patt: '[lemma="water"]',
						context: '3:5',
						within: 's',
						annotation: 'lemma',
						scorertype: scorer.value,
					}) satisfies BLCollocationsParameters,
			);
			return { changeSort, cols, info, query, rows, scorer, scorerLabel, sort, sortStatus };
		},
		template: `
			<main style="max-width: 960px; margin: 0 auto; padding: 28px;">
				<header style="margin-bottom: 24px;">
					<h2 style="margin-top: 0;">Collocates of <em>water</em></h2>
					<p class="text-muted">Lemma · 3 tokens before / 5 after · within sentence · {{ scorerLabel }}</p>
				</header>
				<div style="display: flex; justify-content: flex-end; margin-bottom: 10px;">
					<CollocationScorerToggle v-model="scorer" />
				</div>
				<GenericTable
					:cols="cols"
					:header="cols.groupColumns"
					:rows="rows"
					:info="info"
					:query="query"
					:sort="sort"
					type="hits"
					operation="collocations"
					disable-details
					@change-sort="changeSort"
				/>
				<p role="status" aria-live="polite" style="margin-top: 16px;">{{ sortStatus }}</p>
			</main>
		`,
	}),
};
