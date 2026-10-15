// @ts-check
/// <reference path="../../dist/customization-api/index.d.ts" />

// Host helpers and components share the client's Vue types.
/** @type {typeof import('vue').h} */
const render = frontend.vue.h;

// @ts-expect-error aliases marked @internal are not public types
void (/** @type {import('../../dist/customization-api/index.d.ts').DefineFieldComponentProps<{}>} */ ({}));
// @ts-expect-error underscore-prefixed implementation aliases are not public types
void (/** @type {import('../../dist/customization-api/index.d.ts')._CqlAnnotationNode} */ ({}));

frontend.customizeSearchForm({
	configure(form) {
		/** @type {import('../../dist/customization-api/index.d.ts').NormalizedIndex} */
		const normalizedIndex = form.corpus;
		void normalizedIndex.relations;

		void form.corpus.status;
		void form.corpus.allAnnotations[0]?.caseSensitive;
		const annotatedField = form.corpus.allAnnotatedFields[0];
		if (annotatedField?.isParallel) void annotatedField.prefix;
		// @ts-expect-error corpus data is deeply readonly for client scripts
		form.corpus.displayName = 'Changed';

		form.setSimpleAnnotation('lemma');
		form.setExtendedAnnotations(['word', 'lemma']);
		form.configureAdvanced({ annotationIds: ['word', 'lemma'], defaultAnnotationId: 'word' });
		form.setMetadataFilters(['author', 'date_from', 'date_to']);
		form.configureWithin({ enabled: false });
		form.configureExplore({
			searchAnnotationIds: ['word'],
			defaultSearchAnnotationId: 'word',
			groupAnnotationIds: ['lemma'],
			defaultGroupAnnotationId: 'lemma',
			corpora: { groupMetadataIds: ['author'], defaultGroupMetadataId: 'author' },
		});
		form.addSpanFilter({
			elementName: 'speech',
			attributeName: 'speaker',
			control: 'auto',
			groupId: 'Speakers',
		});

		// @ts-expect-error enabled must be a boolean
		form.configureWithin({ enabled: 'yes' });
	},
	customize(form) {
		const { TextField, SelectField } = form.components;
		/** @type {import('../../dist/customization-api/index.d.ts').Option} */
		const option = { value: 'noun', label: 'Noun' };
		/** @type {import('../../dist/customization-api/index.d.ts').OptGroup} */
		const group = { label: 'Parts of speech', options: [option] };
		/** @type {import('../../dist/customization-api/index.d.ts').Options} */
		const options = [group, 'verb'];
		form.newField('typed/select', form.controllers.annotationSelectController, SelectField, { annotationId: 'pos', displayName: 'Part of speech', options });
		render(TextField, { id: 'typed/render', htmlId: 'typed-render', displayName: 'Word', modelValue: { value: '', caseSensitive: false } });
		const { annotationTextController } = form.controllers;
		form.newField('typed/word', annotationTextController, TextField, { annotationId: 'word', displayName: 'Word' });
		form.newField('typed/cql', form.controllers.expertQueryController, form.components.RawCqlField, { hideLabel: true });
		form.newField('typed/within', form.controllers.withinController, form.components.WithinField, { options: [{ value: 's', label: 'Sentence' }] });
		form.newField('typed/checkbox', form.controllers.filterCheckboxController, form.components.CheckboxField, { metadataFieldId: 'genre', displayName: 'Genre', options: [{ value: 'fiction' }] });
		form.newField('typed/radio', form.controllers.filterRadioController, form.components.RadioField, { metadataFieldId: 'genre', displayName: 'Genre', options: [{ value: 'fiction' }] });
		form.newField('typed/date', form.controllers.filterDateController, form.components.DateField, { metadataFieldId: 'date', displayName: 'Date', range: true });
		const annotation = form.corpus.firstMainAnnotation;
		form.newField('typed/builder', form.controllers.queryBuilderController, form.components.QueryBuilderField, {
			options: {
				indexId: form.corpus.id,
				defaultAnnotationId: annotation.id,
				textDirection: form.corpus.textDirection,
				allAnnotationsMap: { [annotation.id]: { ...annotation, values: undefined, subAnnotations: undefined } },
				annotationOptions: [{ value: annotation.id }],
				autocomplete: async () => [],
			},
		});
		// @ts-expect-error raw CQL is a string, not the text field's structured state
		form.newField('typed/cql-mismatch', form.controllers.expertQueryController, TextField, {});
		// @ts-expect-error query builder configuration must supply its options
		form.newField('typed/builder-missing', form.controllers.queryBuilderController, form.components.QueryBuilderField, {});
		// @ts-expect-error the text controller cannot supply a select field's state
		form.newField('typed/mismatch', annotationTextController, SelectField, { annotationId: 'word', displayName: 'Word', options: [] });
		// @ts-expect-error annotationId is required by this controller
		form.newField('typed/missing', annotationTextController, TextField, { displayName: 'Word' });
		// @ts-expect-error field state belongs to the runtime, not node configuration
		form.newField('typed/state', annotationTextController, TextField, { annotationId: 'word', displayName: 'Word', modelValue: { value: '', caseSensitive: false } });
		const date = form.metadataMultiFieldDate(
			{ id: 'date-range', defaultDisplayName: 'Date' },
			{
				id: 'date-range',
				fromField: 'date_from',
				toField: 'date_to',
				min: '1200-01-01',
				max: '1300-12-31',
			},
		);
		form.graph.getContainer(form.ids.filterTab('Date'))?.prependChild(date);
		const dateTab = form.newContainer(form.ids.filterTab('Date'), { title: 'Dates', layout: 'list' }, [date]);
		form.graph.replaceNode(dateTab.id, dateTab);
		const simple = form.newForm(form.ids.searchForm('simple'), { title: 'Lemma search' }, [form.annotationText('lemma', { id: 'custom/lemma' })]);
		form.graph.replaceNode(simple.id, simple);
		// @ts-expect-error detached construction returns a node; graph lookups provide editing methods
		dateTab.addChildren(date);

		// @ts-expect-error this constructor requires both fromField and toField
		form.metadataMultiFieldRange('date', { id: 'broken', fromField: 'date_from' });

		// @ts-expect-error graph nodes are opaque handles returned by constructors
		form.graph.replaceNode(form.ids.queryField('simple'), { id: 'fake', kind: 'field' });

		// @ts-expect-error auto is resolved only by addSpanFilter during configuration
		form.withinAttribute({ id: 'speaker', elementName: 'speech', attributeName: 'speaker' }, { id: 'speaker', control: 'auto' });
	},
});
