/// <reference types="vite/client" />

interface ViteTypeOptions {
	// By adding this line, you can make the type of ImportMetaEnv strict
	// to disallow unknown keys.
	strictImportMetaEnv: unknown;
}

// See https://vite.dev/guide/env-and-mode
interface ImportMetaEnv {
	readonly MODE: 'development' | 'production';
	readonly PROD: boolean;
	readonly DEV: boolean;
	// there's more built-in constants, but we don't need them.
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
