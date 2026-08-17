// @ts-check
/// <reference path="../../dist/customization-api/index.d.ts" />

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

		// @ts-expect-error this constructor requires both fromField and toField
		form.metadataMultiFieldRange('date', { id: 'broken', fromField: 'date_from' });

		// @ts-expect-error graph nodes are opaque handles returned by constructors
		form.graph.replaceNode(form.ids.queryField('simple'), { id: 'fake', kind: 'field' });

		// @ts-expect-error auto is resolved only by addSpanFilter during configuration
		form.withinAttribute({ id: 'speaker', elementName: 'speech', attributeName: 'speaker' }, { id: 'speaker', control: 'auto' });
	},
});
