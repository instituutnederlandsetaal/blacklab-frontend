import type { App } from 'vue';

import type { Translate } from './types';

import { elementAndAttributeNameFromFilterId } from '@/shared/blacklab-helpers/span-filters-helper';
import { optionText, type Option } from '@/shared/utils/options';
import useInjectable from '@/shared/utils/useInjectable';

type TranslateRuntime = {
	t: (key: string, params?: Record<string, unknown> | string) => unknown;
	te: (key: string, locale?: string) => boolean;
	locale: { value: string };
	fallbackLocale: { value: unknown };
};

const [_I18N_INJECTION_KEY, provideInjectedTranslate, useI18n] = useInjectable<Translate>('i18n');

export function provideTranslate(app: App, translate: Translate) {
	Object.assign(app.config.globalProperties, translate);
	provideInjectedTranslate(app, translate);
}

export { useI18n };

export function createTranslate(i18n: TranslateRuntime): Translate {
	function $td<T extends string | null | undefined>(key: string, defaultText: T): T | string {
		const translated = i18n.te(key) ? i18n.t(key) : undefined;
		// oxlint-disable-next-line no-base-to-string
		if (translated != null) return String(translated);

		const fallbackLocale = typeof i18n.fallbackLocale.value === 'string' ? i18n.fallbackLocale.value : undefined;
		if (fallbackLocale && i18n.locale.value !== fallbackLocale && i18n.te(key, fallbackLocale)) {
			const fallbackTranslated = i18n.t(key, fallbackLocale);
			// oxlint-disable-next-line no-base-to-string
			if (fallbackTranslated != null) return String(fallbackTranslated);
		}

		return defaultText;
	}

	function $tWithinElementDisplayName(element: Option): string {
		const defaultLabel = optionText(element.label);
		if (!element.value) return defaultLabel || String(i18n.t('search.extended.withinDocument'));
		return $td(`index.spans.${element.value}`, defaultLabel || element.value);
	}

	function $tWithinAttributeDisplayName(element: string, attribute: string, defaultDisplayName?: string): string {
		const defaultValue = defaultDisplayName ?? String(i18n.t('results.shared.spanAttribute', { span: element, attribute }));
		return $td(`index.spanAttributes.${element}.${attribute}`, defaultValue);
	}

	const translate: Translate = {
		$t(key: string, params?: Record<string, unknown>) {
			return String(params ? i18n.t(key, params) : i18n.t(key));
		},
		$td,
		$tAnnotatedFieldDisplayName(field) {
			return $td(`index.annotatedFields.${field.id}`, field.isParallel ? field.version || field.id : field.defaultDisplayName || field.id);
		},
		$tAnnotatedFieldDescription(field) {
			return $td(`index.annotatedFields.${field.id}_description`, field.defaultDescription);
		},
		$tAnnotDisplayName(annotation) {
			return $td(`index.annotations.${annotation.id}`, annotation.defaultDisplayName || annotation.id);
		},
		$tAnnotDescription(annotation) {
			return $td(`index.annotations.${annotation.id}_description`, annotation.defaultDescription);
		},
		$tAnnotGroupName(group) {
			return $td(`index.annotationGroups.${group.id}`, group.id);
		},
		$tMetaDisplayName(metadata) {
			const [tag, attribute] = metadata.isSpanFilter ? elementAndAttributeNameFromFilterId(metadata.id) : [null, null];
			const subKey = metadata.isSpanFilter ? `spanFilters.${tag}.${attribute}` : metadata.id;
			return $td(`index.metadata.${subKey}`, metadata.defaultDisplayName || metadata.id);
		},
		$tMetaDescription(metadata) {
			return $td(`index.metadata.${metadata.id}_description`, metadata.defaultDescription);
		},
		$tMetaGroupName<T extends string | undefined | null>(group: { id: string } | T): T | string {
			const originalName = group ? (typeof group === 'string' ? group : group.id) : undefined;
			if (!originalName) return undefined as T;
			return $td(`index.metadataGroups.${originalName}`, originalName);
		},
		$tWithinElementDisplayName,
		$tWithinAttributeDisplayName,
		$tSpanDisplayName: $tWithinElementDisplayName,
		$tSpanAttributeDisplay: $tWithinAttributeDisplayName,
		$tAlignByDisplayName(alignBy) {
			return $td(`index.alignBy.${alignBy.value}`, optionText(alignBy.label) || alignBy.value);
		},
	};

	return translate;
}
