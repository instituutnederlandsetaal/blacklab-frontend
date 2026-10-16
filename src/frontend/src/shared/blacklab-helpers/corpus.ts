import type { Corpus, NormalizedAnnotatedField } from '@/types/apptypes';
import type { BLDocInfo } from '@/types/blacklabtypes';

type CorpusFields = Pick<Corpus, 'mainAnnotatedField' | 'allAnnotatedFieldsMap'>;

/** Resolve an annotated field or an unambiguous parallel version; an omitted field selects the corpus default. */
export function resolveAnnotatedField(corpus: CorpusFields, fieldName?: string | null): NormalizedAnnotatedField | undefined {
	if (!fieldName) return corpus.allAnnotatedFieldsMap[corpus.mainAnnotatedField];
	const exact = corpus.allAnnotatedFieldsMap[fieldName];
	if (exact) return exact;
	const versions = Object.values(corpus.allAnnotatedFieldsMap).filter(field => field.id.endsWith(`__${fieldName}`));
	return versions.length === 1 ? versions[0] : undefined;
}

/** Legacy unnamed counts describe the main field; a missing parallel version has no known length. */
export function getDocumentLength(corpus: CorpusFields, docInfo: BLDocInfo, fieldName?: string | null): number | undefined {
	const field = resolveAnnotatedField(corpus, fieldName);
	if (!field) return undefined;
	return docInfo.tokenCounts.find(count => count.fieldName === field.id)?.tokens ?? (field.id === corpus.mainAnnotatedField ? docInfo.tokenCounts.find(count => !count.fieldName)?.tokens : undefined);
}
