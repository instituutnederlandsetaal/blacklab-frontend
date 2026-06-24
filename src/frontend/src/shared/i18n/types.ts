import type { NormalizedAnnotatedField, NormalizedAnnotation, NormalizedAnnotationGroup } from '@/types/apptypes';

import type { Option } from '@/shared/utils/options';

export type Translate = {
	$t: (key: string, params?: Record<string, unknown>) => string;
	/** Translate the key, trying the current locale, then the fallbacklocale, before finally returning the default. */
	$td: <T extends string | null | undefined>(key: string, defaultText: T) => T | string;
	/** Get the localized display name for an annotated field or the default value.
	 * Note that the field ID should be *including* the parallel suffix. So just e.g. "contents__en" for a parallel field. */
	$tAnnotatedFieldDisplayName: (field: { id: string; defaultDisplayName?: string; version?: string; isParallel?: boolean }) => string;
	$tAnnotatedFieldDescription: (field: Pick<NormalizedAnnotatedField, 'id' | 'defaultDescription'>) => string;
	/** Get the localized display name for an annotation or the default value */
	$tAnnotDisplayName: (annotation: Pick<NormalizedAnnotation, 'id' | 'defaultDisplayName'>) => string;
	/** Get the localized description for an annotation or the default value */
	$tAnnotDescription: (annotation: Pick<NormalizedAnnotation, 'id' | 'defaultDescription'>) => string;
	// We decided not to allow translation individual field values for now, as it is a footgun
	// users would no longer be able to to see the canonical contents of their corpus
	// as well as it being a neverending source of drift and missing translations
	// in the future, we could perhaps consider allowing it for metadata field values, as those are generally more limited
	// /** Get the localized display name for specific value of an annotation or the default value */
	// $tAnnotValue:
	// $tMetaValue:
	/** Get the localized display name for an annotation group or the default value */
	$tAnnotGroupName: (group: NormalizedAnnotationGroup) => string;
	/** Get the localized display name for a metadata field or the default value */
	$tMetaDisplayName: (metadata: { id: string; defaultDisplayName?: string; componentName?: string; behaviourName?: string; isSpanFilter?: boolean }) => string;
	/** Get the localized description for a metadata field or the default value */
	$tMetaDescription: (metadata: { id: string; defaultDescription?: string }) => string | undefined;
	/** Get the localized display name of a metadata group or the default value  */
	$tMetaGroupName: <T extends string | undefined | null>(group: { id: string } | T) => T | string;
	/** Get the localized display name for a span (the target of 'within' queries, e.g. 'sentence' for a span of 's', meaning an <s/> element in XML documents) */
	$tSpanDisplayName: (span: Option) => string;
	/** Get the localized display name for a span attribute or the default value. I.e. an attribute of a span element. Like 'speaker' on a sentence (<s speaker=.../>) */
	$tSpanAttributeDisplay: (span: string, attribute: string) => string;
	/** Align works with spans, TODO check if these shouldn't use the same function? */
	$tAlignByDisplayName: (alignBy: Option) => string;
};

declare module 'vue' {
	interface ComponentCustomProperties extends Translate {}
}
