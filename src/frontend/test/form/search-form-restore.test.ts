// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref, type ObjectPlugin } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import defaultPageConfig from '@/entities/page-config/page-config.default';
import { provideCurrentCorpus, provideCurrentTagset } from '@/entities/corpus/model/corpus-context';
import { provideCurrentConfig } from '@/entities/page-config/page-config';
import { provideBlackLabApi } from '@/shared/api/useApi';
import { createMockI18n } from '@/shared/i18n/mock';
import { resolvedRequest } from '../mocks/api';
import * as UIStore from '@/pages/search/config/ui-customization-store';
import SearchForm from '@/pages/search/form/ui/SearchForm.vue';
import type { NormalizedAnnotation, NormalizedIndex } from '@/types/apptypes';

function annotation(id: string, isMainAnnotation = false): NormalizedAnnotation {
	return {
		annotatedFieldId: 'contents',
		caseSensitive: false,
		defaultDescription: `${id} description`,
		defaultDisplayName: id,
		hasForwardIndex: true,
		id,
		isInternal: false,
		isMainAnnotation,
		offsetsAlternative: '',
		uiType: 'text',
	};
}

function createIndex(): NormalizedIndex {
	const annotations = {
		word: annotation('word', true),
		word_or_lemma: annotation('word_or_lemma'),
	};

	return {
		annotatedFields: {
			contents: {
				annotations,
				defaultDescription: '',
				defaultDisplayName: 'Contents',
				hasContentStore: true,
				hasLengthTokens: true,
				hasXmlTags: true,
				id: 'contents',
				isAnnotatedField: true,
				isParallel: false,
				mainAnnotationId: 'word',
			},
		},
		annotationGroups: [{ annotatedFieldId: 'contents', id: 'Basics', entries: ['word', 'word_or_lemma'], isRemainderGroup: false }],
		contentViewable: true,
		description: '',
		displayName: 'Test corpus',
		documentCount: 1,
		fieldInfo: {} as NormalizedIndex['fieldInfo'],
		id: 'test-corpus',
		indexProgress: null,
		mainAnnotatedField: 'contents',
		metadataFieldGroups: [],
		metadataFields: {},
		owner: null,
		relations: { relations: {}, spans: {} },
		status: 'available',
		textDirection: 'ltr',
		timeModified: '',
		tokenCount: 1,
	};
}

function createProviders(index: NormalizedIndex): ObjectPlugin {
	const i18n = createMockI18n();
	return {
		install(app) {
			provideCurrentCorpus(app, index);
			provideCurrentConfig(app, defaultPageConfig);
			provideCurrentTagset(app, ref(undefined));
			provideBlackLabApi(app, {
				getTermAutocomplete: vi.fn(() => resolvedRequest([])),
				getMetadataAutocomplete: vi.fn(() => resolvedRequest([])),
			} as any);
			i18n.install(app);
		},
	};
}

afterEach(() => {
	UIStore.getState().search.simple.searchAnnotationId = '';
});

describe('search form URL restoration', () => {
	test('restores simple form input when customization changes the simple annotation after the initial route decode', async () => {
		UIStore.getState().search.simple.searchAnnotationId = '';
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [{ path: '/:corpus/search/:results?', component: { template: '<div />' } }],
		});
		await router.push('/Gysseling/search/hits?patt=%5Bword_or_lemma%3D%22%28%3Fi%29koe%22%5D&f.form=simple&f.word_or_lemma=koe');
		await router.isReady();

		const wrapper = mount(SearchForm, {
			global: {
				plugins: [router, createProviders(createIndex())],
				stubs: { debug: true },
			},
		});

		expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('');

		UIStore.getState().search.simple.searchAnnotationId = 'word_or_lemma';
		await nextTick();
		await nextTick();

		expect((wrapper.get('input[type="text"]').element as HTMLInputElement).value).toBe('koe');
	});
});
