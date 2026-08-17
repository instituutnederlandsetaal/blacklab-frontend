// @ts-check
/// <reference path="../../dist/customization-api/index.d.ts" />

// #region edges-example
/** @type {(field: { readonly id: string }) => boolean} */
const includeBookName = field => field.id === 'bookName';

frontend.customizeSearchForm(form => {
	form.setAnnotationControl('word', 'autocomplete');
	form.filterMetadataFields(includeBookName);
	form.configureWithin({ includeElement: elementName => elementName !== 'div' });
	form.addSpanFilter({
		elementName: 'ab',
		attributeName: 'chapter',
		control: 'range',
		groupId: 'Chapter and verse',
		defaultDisplayName: 'Chapter',
	});
	form.addSpanFilter({
		elementName: 'ab',
		attributeName: 'verse',
		control: 'range',
		groupId: 'Chapter and verse',
		defaultDisplayName: 'Verse',
	});
});

frontend.customizeSearchResults({
	includeMetadataField: includeBookName,
	highlightStyle(section) {
		if (section.kind === 'capture') return 'static';
		if (section.relationType === 'verse-alignment') return 'none';
		return 'hover';
	},
	hitInfoColumn: {
		content({ spans, field, document }) {
			const verse = spans.find(span => span.tagName === 'ab');
			if (!verse) return field.displayName;

			const bookChapterVerse = verse.attributes?.['book-chapter-verse']?.[0];
			const book = document.metadata.bookId?.[0];
			const chapterVerse = verse.attributes?.['chapter-verse']?.[0];
			return [field.displayName, bookChapterVerse ?? [book, chapterVerse].filter(Boolean).join(' ')].filter(Boolean).join(' ');
		},
	},
	exportDescription({ sourceField, targetFields }) {
		const targets = targetFields.map(field => field.displayName).join(', ');
		return targets ? `${sourceField.displayName} -> ${targets}` : sourceField.displayName;
	},
	includeGroupingSpanAttribute({ elementName, attributeName }) {
		if (elementName !== 'ab') return null;
		return attributeName === 'book-chapter-verse' || attributeName === 'book-chapter';
	},
});
// #endregion edges-example

frontend.customizeSearchResults({
	includeMetadataField: field => field.id !== 'internal',
	// @ts-expect-error withSpans accepts a boolean or a callback, not a string
	withSpans: 'always',
	// @ts-expect-error blink is not a supported highlight style
	highlightStyle: () => 'blink',
	hitInfoColumn: {
		content(context) {
			// @ts-expect-error document metadata is normalized; the legacy docInfo shape is not exposed
			return context.document.docInfo.metadata.bookId[0];
		},
	},
	includeGroupingSpanAttribute(attribute) {
		// @ts-expect-error attributeName is a string, not a numeric identifier
		return attribute.attributeName === 42;
	},
	// @ts-expect-error option groups cannot be nested inside another group
	customizeSorting(group) {
		return {
			...group,
			options: [{ label: 'nested', options: [] }],
		};
	},
});
