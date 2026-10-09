// Oxlint/OXC vscode extension is buggy:
// it needs the `oxlint-tsgolint` dependency to be installed manually (doesn't ship it).
// So that lives in node_modules,
// But the extension can't find node_modules since it's not at the project root.
// You can override the location through vscode settings.json, but that triggers a secondary issue:
// the extension will then use that path, but use the an executable for the wrong platform (e.g., Windows vs. Linux)
// That then fails for obvious reasons.

// So we manually set the complete executable path to be this (wrapper) script, and launch the correct platform-specific executable ourselves.
// We can remove this once the issues are resolved upstream:
// https://github.com/oxc-project/oxc/issues/21551
// https://github.com/oxc-project/oxc-vscode/issues/238
// https://github.com/oxc-project/oxc/pull/26849
// https://github.com/oxc-project/oxc/pull/26848
// https://github.com/oxc-project/oxc-vscode/pull/395

import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const tsgolintRequire = createRequire(require.resolve('oxlint-tsgolint/package.json'));

process.env.OXLINT_TSGOLINT_PATH = tsgolintRequire.resolve(`@oxlint-tsgolint/${process.platform}-${process.arch}/tsgolint${process.platform === 'win32' ? '.exe' : ''}`);

await import(new URL('./bin/oxlint', import.meta.resolve('oxlint/package.json')).href);
