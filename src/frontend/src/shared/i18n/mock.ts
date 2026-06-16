import type { ObjectPlugin } from 'vue';

import { provideTranslate } from './translate';
import type { Translate } from './types';


export const createMockTranslate = (overrides: Partial<Translate> = {}): Translate => ({
	$t(key: string) {
		return key;
	},
	$td<T extends string | null | undefined>(_key: string, defaultText: T) {
		return defaultText;
	},
	$tAnnotatedFieldDisplayName(field) {
		return field.isParallel ? field.version || field.id : field.defaultDisplayName || field.id;
	},
	$tAnnotatedFieldDescription(field) {
		return field.defaultDescription;
	},
	$tAnnotDisplayName(annotation) {
		return annotation.defaultDisplayName || annotation.id;
	},
	$tAnnotDescription(annotation) {
		return annotation.defaultDescription;
	},
	$tAnnotGroupName(group) {
		return group.id;
	},
	$tMetaDisplayName(metadata) {
		return metadata.defaultDisplayName || metadata.id;
	},
	$tMetaDescription(metadata) {
		return metadata.defaultDescription || '';
	},
	$tMetaGroupName<T extends string | undefined | null>(group: { id: string } | T) {
		if (!group) return undefined as T;
		return typeof group === 'string' ? group : group.id;
	},
	$tSpanDisplayName(span) {
		return span.label || span.value;
	},
	$tSpanAttributeDisplay(span, attribute) {
		return `${span} ${attribute}`;
	},
	$tAlignByDisplayName(alignBy) {
		return alignBy.label || alignBy.value;
	},
	...overrides,
});

export const createMockI18n = (overrides: Partial<Translate> = {}): ObjectPlugin & { translate: Translate } => {
	const translate = createMockTranslate(overrides);

	return {
		install(app) {
			provideTranslate(app, translate);
		},
		translate,
	};
};
