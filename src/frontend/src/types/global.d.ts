// an import or export is required for this to be a "module", which it must be to declare globals (??? - https://stackoverflow.com/questions/42233987/how-to-configure-custom-global-interfaces-d-ts-files-for-typescript/42257742#42257742)
export {};
declare global {
	// ---------------------------
	// valid on all pages
	// ---------------------------
	const INDEX_ID: string;

	const WITH_CREDENTIALS: boolean;

	/** URL for the root path of the frontend. Guaranteed NOT to end in a slash. */
	const CONTEXT_URL: string;
	/** Guaranteed to end in a slash. Does not contain the corpus id. */
	const BLS_URL: string;

	const PLAUSIBLE_DOMAIN: string|null;
	const PLAUSIBLE_APIHOST: string|null;

	const OIDC_METADATA_URL: string|null;
	const OIDC_CLIENT_ID: string|null;
	const OIDC_AUTHORITY: string|null;

	// ---------------------------
	// only valid on the article page (/docs/...)
	// ---------------------------
	// const DOCUMENT_ID: string;
	// const DOCUMENT_LENGTH: number;

	/** PAGE_SIZE may be undefined on the search page, but is always defined in the document page. */
	// const PAGE_SIZE: number|undefined;
	// const pageStart: number;
	// const pageEnd: number;

	// ---------------------------
	// only valid on the search page (/search/...)
	// ---------------------------
	// const PAGE_SIZE: number; // also on the article page (but we can only define it once)
	// const PROPS_IN_COLUMNS: string[];

	const DEBUG_INFO_VISIBLE: boolean;
}