// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';

import type { SearchResultExportContext, SearchResultsCustomization } from '@/customization-api/external/external-api';
import { createCustomizations } from '@/customization-api/internal/internal-api';
import { createCustomizationRegistry } from '@/customization-api/registry';

import type { Translate } from '@/shared/i18n';

const corpusId = 'edges-results-api-test';
const unregisterCallbacks: Array<() => void> = [];
const initialCorpus = { id: corpusId, relations: { spans: {} } } as never;
const customizationRegistry = createCustomizationRegistry(initialCorpus);
const customizations = createCustomizations(customizationRegistry, initialCorpus, {} as never, () => {});
const metadataFields = {
	bookId: {
		id: 'bookId',
		defaultDisplayName: 'Book ID',
		defaultDescription: '',
		uiType: 'text' as const,
	},
	title: {
		id: 'title',
		defaultDisplayName: 'Title',
		defaultDescription: '',
		uiType: 'text' as const,
	},
};
const highlightSection = {
	key: 'alignments[0]',
	kind: 'relation' as const,
	display: 'verse-alignment',
	relationClass: 'al',
	relationType: 'verse-alignment',
	sourceStart: 0,
	sourceEnd: 1,
	targetStart: 5,
	targetEnd: 6,
	isRelation: true,
	showHighlight: true,
	relClass: 'al',
	relType: 'verse-alignment',
};
const spanAttribute = { elementName: 's', attributeName: 'type' };

function register(customization: SearchResultsCustomization): () => void {
	const unregister = customizationRegistry.registerResults(customization);
	unregisterCallbacks.push(unregister);
	return unregister;
}

afterEach(() => {
	for (const unregister of unregisterCallbacks.splice(0).reverse()) unregister();
	vi.restoreAllMocks();
});

describe('search results customization registrations and resolvers', () => {
	test('resolves the newest non-null tri-state result', () => {
		register({
			withSpans: query => (query === 'force' ? true : null),
			includeMetadataField: field => (field.id === 'bookId' ? false : null),
		});
		register({
			withSpans: query => (query === 'suppress' ? false : null),
			includeMetadataField: field => (field.id === 'title' ? true : null),
		});
		expect(customizations.searchWithSpans('force')).toBe(true);
		expect(customizations.searchWithSpans('suppress')).toBe(false);
		expect(customizations.searchWithSpans('default')).toBeNull();
		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(false);
		expect(customizations.resultMetadataField(metadataFields.title)).toBe(true);
	});

	test('continues with an older customization when a newer dynamic hook returns null or throws', () => {
		register({ withSpans: false, includeMetadataField: () => false });
		register({
			withSpans() {
				throw new Error('broken request hook');
			},
			includeMetadataField: () => null,
		});

		expect(customizations.searchWithSpans('query')).toBe(false);
		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(false);
	});

	test('treats a static true function-only hook as a failing callback before older and legacy fallbacks', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const legacy = vi.spyOn(customizationRegistry.legacyApi.value!.search.metadata, 'showField').mockReturnValue(true);
		const unregisterOlder = register({ includeMetadataField: () => false });
		register({ includeMetadataField: true } as unknown as SearchResultsCustomization);

		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(false);
		expect(legacy).not.toHaveBeenCalled();
		unregisterOlder();
		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(true);
		expect(legacy).toHaveBeenCalledWith('bookId');
		expect(consoleError).toHaveBeenCalledTimes(2);
		expect(consoleError.mock.calls.map(([message]) => message)).toEqual([
			"Error in search results customization 'includeMetadataField':",
			"Error in search results customization 'includeMetadataField':",
		]);
	});

	test('continues newest-first after exceptions for every fallback hook shape', () => {
		const calls: string[] = [];
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const legacy = customizationRegistry.legacyApi.value!;
		const legacyHooks = [
			vi.spyOn(legacy.search.pattern, 'shouldAddWithSpans'),
			vi.spyOn(legacy.search.metadata, 'showField'),
			vi.spyOn(legacy.results, 'matchInfoHighlightStyle'),
			vi.spyOn(legacy.results.export, 'includeSpanAttribute'),
			vi.spyOn(legacy.group, 'includeSpanAttribute'),
		];
		register({
			withSpans: () => (calls.push('withSpans:old'), false),
			includeMetadataField: () => (calls.push('includeMetadataField:old'), false),
			highlightStyle: () => (calls.push('highlightStyle:old'), 'none'),
			includeExportSpanAttribute: () => (calls.push('includeExportSpanAttribute:old'), false),
			includeGroupingSpanAttribute: () => (calls.push('includeGroupingSpanAttribute:old'), false),
		});
		register({});
		register({
			withSpans() {
				calls.push('withSpans:new');
				throw new Error('withSpans');
			},
			includeMetadataField() {
				calls.push('includeMetadataField:new');
				throw new Error('includeMetadataField');
			},
			highlightStyle() {
				calls.push('highlightStyle:new');
				throw new Error('highlightStyle');
			},
			includeExportSpanAttribute() {
				calls.push('includeExportSpanAttribute:new');
				throw new Error('includeExportSpanAttribute');
			},
			includeGroupingSpanAttribute() {
				calls.push('includeGroupingSpanAttribute:new');
				throw new Error('includeGroupingSpanAttribute');
			},
		});

		expect(customizations.searchWithSpans('query')).toBe(false);
		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(false);
		expect(customizations.matchInfoHighlightStyle(highlightSection)).toBe('none');
		expect(customizations.exportSpanAttribute(spanAttribute)).toBe(false);
		expect(customizations.groupingSpanAttribute(spanAttribute)).toBe(false);
		expect(calls).toEqual([
			'withSpans:new',
			'withSpans:old',
			'includeMetadataField:new',
			'includeMetadataField:old',
			'highlightStyle:new',
			'highlightStyle:old',
			'includeExportSpanAttribute:new',
			'includeExportSpanAttribute:old',
			'includeGroupingSpanAttribute:new',
			'includeGroupingSpanAttribute:old',
		]);
		expect(consoleError.mock.calls.map(([message]) => message)).toEqual([
			"Error in search results customization 'withSpans':",
			"Error in search results customization 'includeMetadataField':",
			"Error in search results customization 'highlightStyle':",
			"Error in search results customization 'includeExportSpanAttribute':",
			"Error in search results customization 'includeGroupingSpanAttribute':",
		]);
		for (const legacyHook of legacyHooks) expect(legacyHook).not.toHaveBeenCalled();
	});

	test('uses each legacy fallback only after typed hooks return null', () => {
		const calls: string[] = [];
		const legacy = customizationRegistry.legacyApi.value!;
		const withSpans = vi.spyOn(legacy.search.pattern, 'shouldAddWithSpans').mockImplementation(() => (calls.push('withSpans:legacy'), true));
		const metadata = vi.spyOn(legacy.search.metadata, 'showField').mockImplementation(() => (calls.push('includeMetadataField:legacy'), false));
		const highlight = vi.spyOn(legacy.results, 'matchInfoHighlightStyle').mockImplementation(() => (calls.push('highlightStyle:legacy'), 'hover'));
		const exportAttribute = vi.spyOn(legacy.results.export, 'includeSpanAttribute').mockImplementation(() => (calls.push('includeExportSpanAttribute:legacy'), true));
		const groupingAttribute = vi.spyOn(legacy.group, 'includeSpanAttribute').mockImplementation(() => (calls.push('includeGroupingSpanAttribute:legacy'), false));
		register({});
		register({
			withSpans: () => (calls.push('withSpans:typed'), null),
			includeMetadataField: () => (calls.push('includeMetadataField:typed'), null),
			highlightStyle: () => (calls.push('highlightStyle:typed'), null),
			includeExportSpanAttribute: () => (calls.push('includeExportSpanAttribute:typed'), null),
			includeGroupingSpanAttribute: () => (calls.push('includeGroupingSpanAttribute:typed'), null),
		});

		expect(customizations.searchWithSpans('query')).toBe(true);
		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(false);
		expect(customizations.matchInfoHighlightStyle(highlightSection)).toBe('hover');
		expect(customizations.exportSpanAttribute(spanAttribute)).toBe(true);
		expect(customizations.groupingSpanAttribute(spanAttribute)).toBe(false);
		expect(calls).toEqual([
			'withSpans:typed',
			'withSpans:legacy',
			'includeMetadataField:typed',
			'includeMetadataField:legacy',
			'highlightStyle:typed',
			'highlightStyle:legacy',
			'includeExportSpanAttribute:typed',
			'includeExportSpanAttribute:legacy',
			'includeGroupingSpanAttribute:typed',
			'includeGroupingSpanAttribute:legacy',
		]);
		expect(withSpans).toHaveBeenCalledWith('query');
		expect(metadata).toHaveBeenCalledWith('bookId');
		expect(highlight).toHaveBeenCalledWith(highlightSection);
		expect(exportAttribute).toHaveBeenCalledWith('s', 'type');
		expect(groupingAttribute).toHaveBeenCalledWith('s', 'type');
	});

	test('uses the legacy result metadata policy by default and lets a result hook override it', () => {
		vi.spyOn(customizationRegistry.legacyApi.value!.search.metadata, 'showField').mockImplementation(fieldId => (fieldId === 'bookId' ? false : null));
		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(false);
		expect(customizations.resultMetadataField(metadataFields.title)).toBeNull();

		register({ includeMetadataField: field => (field.id === 'bookId' ? true : null) });
		expect(customizations.resultMetadataField(metadataFields.bookId)).toBe(true);
	});

	test('passes the internal/public highlight model directly to the newest applicable style hook', () => {
		const style = vi.fn(section => (section.kind === 'relation' && section.relationType === 'verse-alignment' ? ('none' as const) : null));
		register({ highlightStyle: style });

		expect(customizations.matchInfoHighlightStyle(highlightSection)).toBe('none');
		expect(style).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'relation',
				relationClass: 'al',
				relationType: 'verse-alignment',
			}),
		);
	});
});

describe('search results public DTO adapters', () => {
	test('provides normalized hit-column and export contexts to client callbacks', () => {
		const seenContent = vi.fn(context => `${context.field.displayName} ${context.spans[0]?.attributes?.['book-chapter-verse']?.[0]}`);
		const seenVisible = vi.fn(overview => overview.kind === 'hits' && overview.processed.hits === 7);
		const seenDescription = vi.fn((context: SearchResultExportContext) => `source: ${context.sourceField.displayName}, target(s): ${context.targetFields.map(field => field.displayName).join(', ')}`);
		register({
			hitInfoColumn: { visible: seenVisible, content: seenContent },
			exportDescription: seenDescription,
		});

		const corpus = {
			id: corpusId,
			mainAnnotatedField: 'contents__nl_1939',
			allAnnotatedFieldsMap: {
				contents__nl_1939: {
					id: 'contents__nl_1939',
					isParallel: true,
					prefix: 'contents',
					version: 'nl_1939',
				},
				contents__en_1611: {
					id: 'contents__en_1611',
					isParallel: true,
					prefix: 'contents',
					version: 'en_1611',
				},
			},
		};
		const contextCustomizations = createCustomizations(customizationRegistry, corpus as never, {} as never, () => {});
		const field = {
			id: 'contents__nl_1939',
			isParallel: true,
			prefix: 'contents',
			version: 'nl_1939',
		};
		const hit = {
			docPid: 'Joel.xml',
			start: 12,
			end: 13,
			before: { punct: [''], word: ['mijn'] },
			match: { punct: [' '], word: ['God'] },
			after: { punct: [';'], word: ['Want'] },
			matchInfos: {
				'with-spans': {
					type: 'list' as const,
					start: 0,
					end: 30,
					infos: [
						{
							type: 'tag' as const,
							start: 0,
							end: 30,
							tagName: 'ab',
							attributes: { 'book-chapter-verse': ['Joel 1:13'] },
						},
					],
				},
			},
		};
		const document = {
			docPid: 'Joel.xml',
			docInfo: { metadata: { bookId: ['Joel'] }, tokenCounts: [], mayView: true },
		};
		const translate = {
			$tAnnotatedFieldDisplayName: (annotatedField: { id: string }) => (annotatedField.id.endsWith('nl_1939') ? 'Dutch (1939)' : annotatedField.id),
		} as Translate;
		const summary = {
			pattern: {
				fieldName: 'contents__nl_1939',
				otherFields: ['contents__en_1611'],
				bcql: '[word="God"]',
			},
			results: {
				stats: { processed: { hits: 7, documents: 3 }, counted: { hits: 12, documents: 5 } },
			},
		};

		expect(contextCustomizations.hitInfoColumnContent(hit, field as never, document, translate)).toBe('Dutch (1939) Joel 1:13');
		expect(contextCustomizations.hitInfoColumnVisible({ hits: [], docInfos: {}, summary } as never, true)).toBe(true);
		expect(seenContent).toHaveBeenCalledWith(
			expect.objectContaining({
				field: {
					id: 'contents__nl_1939',
					displayName: 'Dutch (1939)',
					prefix: 'contents',
					version: 'nl_1939',
				},
				document: expect.objectContaining({ metadata: { bookId: ['Joel'] } }),
				hit,
				spans: [expect.objectContaining({ type: 'tag', tagName: 'ab' })],
			}),
		);
		expect(seenVisible).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hits', isParallelCorpus: true }));

		expect(contextCustomizations.exportDescription(summary as never, id => `Display ${id}`)).toBe('source: Display contents__nl_1939, target(s): Display contents__en_1611');
		const exportContext = seenDescription.mock.calls[0][0];
		expect(exportContext).toEqual({
			corpus,
			sourceField: {
				id: 'contents__nl_1939',
				displayName: 'Display contents__nl_1939',
				prefix: 'contents',
				version: 'nl_1939',
			},
			targetFields: [
				{
					id: 'contents__en_1611',
					displayName: 'Display contents__en_1611',
					prefix: 'contents',
					version: 'en_1611',
				},
			],
			bcql: '[word="God"]',
			summary,
		});
		expect(seenDescription).toHaveBeenCalledWith(exportContext);
	});
});

describe('search results option customizations', () => {
	test('composes sorting hooks in registration order and resolves deferred option text first', () => {
		const calls: string[] = [];
		register({
			customizeSorting(group) {
				calls.push(`first:${String(group.label)}`);
				return { ...group, options: [...group.options, { value: 'first', label: 'First' }] };
			},
		});
		register({
			customizeSorting(group) {
				calls.push(`second:${group.options.length}`);
				return null;
			},
		});

		const result = customizations.sortOptionGroup({
			label: () => 'Annotations',
			options: [{ value: 'word', label: () => 'Word' }],
		});

		expect(calls).toEqual(['first:Annotations', 'second:2']);
		expect(result).toEqual({
			label: 'Annotations',
			options: [
				{ value: 'word', label: 'Word' },
				{ value: 'first', label: 'First' },
			],
		});
	});

	test('passes the translation facade to grouping hooks', () => {
		const translate = { $t: (key: string) => `translated:${key}` } as Translate;
		register({
			customizeGrouping(group, i18n) {
				return { ...group, label: i18n.$t('group.label') };
			},
		});

		expect(customizations.groupOptionGroup({ options: ['word'] }, translate)).toEqual({
			label: 'translated:group.label',
			options: ['word'],
		});
	});
});
