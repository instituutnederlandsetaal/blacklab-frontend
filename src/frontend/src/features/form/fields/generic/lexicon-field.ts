import Axios from 'axios';
import type { MaybeRefOrGetter } from 'vue';

import type { GenericFieldUiConfig } from '@/features/form/fields/generic/shared-ui-config';

import { filterDuplicates, mapReduce } from '@/shared/utils/array-utils';

type LexiconParams1 = { lemma: string } | { wordform: string };
type LexiconParams = LexiconParams1 & {
	database: string;
	case_sensitive: boolean;
};

type LexiconLemmaIdResponse = {
	message: 'OK';
	lemmata_list: Array<{
		found_lemmata: Array<{
			lemma: string;
			lemma_id: string;
			pos: string;
		}>;
	}>;
};

type LexiconWordformsResponse = {
	message: 'OK';
	wordforms_list: Array<{
		found_wordforms: string[];
	}>;
};

export type LexiconWordOption = {
	lemma: string;
	pos: string[];
	count: number;
	word: string;
	selected: boolean;
};

export type LexiconLookupResult = {
	posOptions: Record<string, boolean>;
	wordList: LexiconWordOption[];
};

export type LexiconLookup = (term: string) => Promise<LexiconLookupResult>;

export type LexiconFieldUiConfig = GenericFieldUiConfig & {
	placeholder?: MaybeRefOrGetter<string | undefined>;
	textDirection?: 'ltr' | 'rtl';
	lookup: LexiconLookup;
};

export const defaultLexiconLookupResult: LexiconLookupResult = {
	posOptions: {},
	wordList: [],
};

export const defaultLexiconServiceConfig = {
	getLemmaIdFromWordform: `https://sk.taalbanknederlands.inl.nl/LexiconService/lexicon/get_lemma/`,
	getLemmaIdFromLemma: `https://sk.taalbanknederlands.inl.nl/LexiconService/lexicon/get_lemma_id_from_lemma/`,
	getWordformsFromLemmaId: `https://sk.taalbanknederlands.inl.nl/LexiconService/lexicon/get_wordforms_from_lemma_id/`,
	caseSensitive: false,
};

export type CreateLexiconLookupOptions = {
	database: string;
	getTermFrequencies: (values: string[]) => Promise<Record<string, number>>;
	service?: Partial<typeof defaultLexiconServiceConfig>;
};

const jsonHeaders = { Accept: 'application/json' };

export function createLexiconLookup(options: CreateLexiconLookupOptions): LexiconLookup {
	const service = { ...defaultLexiconServiceConfig, ...options.service };
	const baseParams = {
		database: options.database,
		case_sensitive: service.caseSensitive,
	} satisfies Omit<LexiconParams, 'lemma' | 'wordform'>;

	return async term => {
		const [lemmataByWordform, lemmataByLemma] = await Promise.all([
			Axios.get<LexiconLemmaIdResponse>(service.getLemmaIdFromWordform, { headers: jsonHeaders, params: { ...baseParams, wordform: term } satisfies LexiconParams }),
			Axios.get<LexiconLemmaIdResponse>(service.getLemmaIdFromLemma, { headers: jsonHeaders, params: { ...baseParams, lemma: term } satisfies LexiconParams }),
		]);
		const lemmata = filterDuplicates(
			[lemmataByWordform, lemmataByLemma].flatMap(response => response.data.lemmata_list.flatMap(entry => entry.found_lemmata)),
			'lemma_id',
		);

		if (!lemmata.length) {
			const frequencies = await options.getTermFrequencies([term]);
			return frequencies[term]
				? {
						posOptions: { [term]: true },
						wordList: [{ lemma: term, pos: [term], count: frequencies[term], word: term, selected: false }],
					}
				: defaultLexiconLookupResult;
		}

		const lemmataWithWordforms = await Promise.all(
			lemmata.map(async lemma => {
				const response = await Axios.get<LexiconWordformsResponse>(service.getWordformsFromLemmaId, {
					headers: jsonHeaders,
					params: {
						database: options.database,
						lemma_id: lemma.lemma_id,
					},
				});
				return {
					lemma: lemma.lemma,
					pos: `${lemma.lemma} (${lemma.pos || 'unknown'})`,
					wordforms: response.data.message === 'OK' ? response.data.wordforms_list.flatMap(wfl => wfl.found_wordforms) : [],
				};
			}),
		);

		const frequencies = await options.getTermFrequencies(lemmataWithWordforms.flatMap(result => result.wordforms).concat(term));
		const wordOptions: Record<string, LexiconWordOption> = {};

		lemmataWithWordforms.forEach(({ pos, wordforms, lemma }) => {
			wordforms.forEach(word => {
				wordOptions[word] ??= {
					lemma,
					pos: [],
					count: frequencies[word],
					word,
					selected: false,
				};
				wordOptions[word].pos.push(pos);
			});

			wordOptions[lemma] ??= {
				lemma,
				pos: [],
				count: frequencies[lemma],
				word: lemma,
				selected: false,
			};
			wordOptions[lemma].pos.push(pos);
		});

		const posList = filterDuplicates(lemmataWithWordforms, 'pos').map(lemma => lemma.pos);
		if (frequencies[term] && !wordOptions[term]) {
			wordOptions[term] = {
				lemma: term,
				pos: posList,
				count: frequencies[term],
				word: term,
				selected: false,
			};
		}

		return {
			posOptions: mapReduce(posList),
			wordList: Object.values(wordOptions)
				.filter(word => word.count > 0)
				.sort((a, b) => ((a.count === 0) !== (b.count === 0) ? (a.count === 0 ? 1 : -1) : 0)),
		};
	};
}
