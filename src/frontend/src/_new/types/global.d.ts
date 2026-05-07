// an import or export is required for this to be a "module", which it must be to declare globals (??? - https://stackoverflow.com/questions/42233987/how-to-configure-custom-global-interfaces-d-ts-files-for-typescript/42257742#42257742)
export {};
declare global {
	// ---------------------------
	// valid on all pages
	// ---------------------------
	// const CorpusStore.get.indexId(): string;

	const WITH_CREDENTIALS: boolean;

	/** URL for the root path of the frontend. Guaranteed NOT to end in a slash. */
	const CONTEXT_URL: string;
	/** Guaranteed to end in a slash. Does not contain the corpus id. */
	const BLS_URL: string;

	const OIDC_METADATA_URL: string|null;
	const OIDC_CLIENT_ID: string|null;
	const OIDC_AUTHORITY: string|null;

	// ---------------------------
	// only valid on the article page (/docs/...)
	// ---------------------------
	// const DOCUMENT_ID: string;
	// const DOCUMENT_LENGTH: number;

	/** PAGE_SIZE is always defined, but may be MAX_INT if pagination is disabled. */
	// const PAGE_SIZE: number;
	// const pageStart: number;
	// const pageEnd: number;

	// ---------------------------
	// only valid on the search page (/search/...)
	// ---------------------------
	// const PAGE_SIZE: number; // also on the article page (but we can only define it once)
	// const PROPS_IN_COLUMNS: string[];

	const DEBUG_INFO_VISIBLE: boolean;
}