import type { Corpus, NormalizedAnnotatedField } from '@/types/apptypes';
import type { BLDocInfo } from '@/types/blacklabtypes';

import { ensureCompleteFieldName } from './parallel-helper';

type CorpusFields = Pick<Corpus, 'mainAnnotatedField' | 'allAnnotatedFieldsMap'>;

/** Resolve an annotated field or a parallel version of the main field; an omitted field selects the corpus default. */
export function resolveAnnotatedField(corpus: CorpusFields, fieldName?: string | null): NormalizedAnnotatedField | undefined {
	if (!fieldName) return corpus.allAnnotatedFieldsMap[corpus.mainAnnotatedField];
	return corpus.allAnnotatedFieldsMap[fieldName] ?? corpus.allAnnotatedFieldsMap[ensureCompleteFieldName(fieldName, corpus.mainAnnotatedField)];
}

/** Legacy unnamed counts describe the main field; a missing parallel version has no known length. */
export function getDocumentLength(docInfo: BLDocInfo, mainField: string, field = mainField): number | undefined {
	return docInfo.tokenCounts.find(count => count.fieldName === field)?.tokens ?? (field === mainField ? docInfo.tokenCounts.find(count => !count.fieldName)?.tokens : undefined);
}
