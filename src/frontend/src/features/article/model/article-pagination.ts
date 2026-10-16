const MAX_OFFSET = 2 ** 31 - 1;

type RequestedRange = { wordstart?: number | null; wordend?: number | null; pageSize?: number | null; findhit?: number };
const integer = (value: number | null | undefined): value is number => value != null && Number.isSafeInteger(value) && Math.abs(value) <= MAX_OFFSET;

/** Word ranges are half-open. Keep valid custom starts, but never create an empty page past the last token. */
export function getArticlePagination(input: RequestedRange, documentLength: number) {
	const pageSize = integer(input.pageSize) && input.pageSize > 0 ? input.pageSize : null;
	const maxPage = pageSize == null ? 0 : Math.max(0, Math.ceil(documentLength / pageSize) - 1);
	if (pageSize == null || documentLength === 0) return { pageSize, wordstart: 0, wordend: documentLength, page: 0, maxPage };
	let wordstart = integer(input.wordstart) ? Math.max(0, input.wordstart) : 0;
	if (wordstart >= documentLength) wordstart = maxPage * pageSize;
	let wordend = integer(input.wordend) && input.wordend > wordstart ? input.wordend : wordstart + pageSize;
	wordend = Math.min(wordend, documentLength, wordstart + pageSize);
	if (integer(input.findhit) && input.findhit >= 0 && input.findhit < documentLength && (input.findhit < wordstart || input.findhit >= wordend)) {
		wordstart = Math.floor(input.findhit / pageSize) * pageSize;
		wordend = Math.min(wordstart + pageSize, documentLength);
	}
	return { pageSize, wordstart, wordend, page: Math.floor(wordstart / pageSize), maxPage };
}
