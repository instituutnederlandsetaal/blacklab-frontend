#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(dirname, '..');
const repoRoot = path.resolve(frontendRoot, '../..');
const viteBin = path.join(frontendRoot, 'node_modules/vite/bin/vite.js');

const defaultCorpus = 'BaB';
const defaultBlackLabUrl = 'https://corpusgysseling.ivdnt.org/blacklab-server/';
const defaultDockerImage = 'blacklab-frontend-url-sync-smoke:local';
const defaultDockerfile = 'docker/frontend-proxy.dockerfile';
const reservedScopedKeys = new Set(['f.form', 'f.tab']);
const legacyFormUiKeys = new Set(['form', 'patternMode', 'exploreMode', 'activeAnnotationTab', 'activeFilterTab']);
const searchModeFormIds = {
	simple: 'search.simple',
	extended: 'search.extended',
};

function parseArgs(argv) {
	const options = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--help' || arg === '-h') {
			options.help = true;
			continue;
		}
		if (!arg.startsWith('--')) {
			throw new Error(`Unexpected argument '${arg}'.`);
		}
		const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
		const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		const nextValue = inlineValue ?? argv[i + 1];
		if (inlineValue == null && (!nextValue || nextValue.startsWith('--'))) {
			options[key] = true;
			continue;
		}
		if (inlineValue == null) i += 1;
		options[key] = nextValue;
	}
	return options;
}

function help() {
	console.log(`
BlackLab Frontend URL sync smoke test

Usage:
  npm run test:url-sync:smoke
  npm run test:url-sync:smoke -- --corpus BaB --frontend-port 18080

Default flow:
  1. Build a local BlackLab Frontend smoke Docker image.
  2. Start that frontend container on an isolated host port.
  3. Configure it with BF_BLSURL/BF_BLSURLEXTERNAL=${defaultBlackLabUrl}
  4. Start Vite on :5173 with /blacklab-frontend proxied to that container.
  5. Drive ${defaultCorpus} search through Playwright and assert URL/store state.

Environment / options:
  BLF_SMOKE_CORPUS / --corpus              Corpus id. Defaults to ${defaultCorpus}
  BLF_SMOKE_BLS_URL / --blacklab-url       BlackLab Server URL. Defaults to ${defaultBlackLabUrl}
  BLF_SMOKE_VITE_PORT / --vite-port        Vite port. Defaults to 5173
  BLF_SMOKE_FRONTEND_PORT / --frontend-port
                                            Java frontend host port. Defaults to a free port near 18080
  BLF_SMOKE_DOCKER_IMAGE / --docker-image  Docker image tag. Defaults to ${defaultDockerImage}
  BLF_SMOKE_DOCKERFILE / --dockerfile      Dockerfile path from repo root. Defaults to ${defaultDockerfile}
  BLF_SMOKE_SKIP_DOCKER_BUILD=true         Reuse the image tag without rebuilding.
  BLF_SMOKE_EXTERNAL_STACK=true            Do not start Docker/Vite; use --url or the default Vite URL.
  BLF_SMOKE_QUERY_SELECTOR                 Override the simple-search input selector.
  BLF_SMOKE_HEADLESS=false                 Run with a visible browser.
  BLF_SMOKE_SLOWMO=100                     Slow Playwright actions down, in ms.
  BLF_SMOKE_KEEP_OPEN=true                 Leave the browser open after the run.
  BLF_SMOKE_TRACE_URL_SYNC=true            Print gated URL-sync trace logs from the browser.
  BLF_SMOKE_TIMEOUT=20000                  Per-step timeout in ms.
`);
}

function option(options, key, envKey, fallback) {
	return options[key] ?? process.env[envKey] ?? fallback;
}

function booleanOption(options, key, envKey, fallback) {
	const value = option(options, key, envKey, fallback);
	return typeof value === 'boolean' ? value : !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

function numberOption(options, key, envKey, fallback) {
	const value = option(options, key, envKey, fallback);
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`Expected ${key} to be a number, got '${value}'.`);
	}
	return parsed;
}

function normalizeBlackLabUrl(url) {
	return String(url).replace(/\/+$/, '');
}

function blackLabProxyOrigin(url) {
	const parsed = new URL(url);
	return `${parsed.protocol}//${parsed.host}`;
}

function assert(condition, message, details) {
	if (condition) return;
	const suffix = details == null ? '' : `\n${typeof details === 'string' ? details : JSON.stringify(details, null, 2)}`;
	throw new Error(`${message}${suffix}`);
}

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function isPortFree(port) {
	return new Promise(resolve => {
		const server = net.createServer();
		server.unref();
		server.once('error', () => resolve(false));
		server.listen(port, '127.0.0.1', () => {
			server.close(() => resolve(true));
		});
	});
}

async function findFreePort(startPort) {
	for (let port = startPort; port < startPort + 100; port += 1) {
		if (await isPortFree(port)) return port;
	}
	throw new Error(`Could not find a free port near ${startPort}.`);
}

function httpGet(url, timeout) {
	return new Promise((resolve, reject) => {
		const request = http.get(url, { timeout }, response => {
			let body = '';
			response.setEncoding('utf8');
			response.on('data', chunk => {
				body += chunk;
			});
			response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
		});
		request.on('timeout', () => {
			request.destroy(new Error(`Timed out fetching ${url}`));
		});
		request.on('error', reject);
	});
}

async function waitForHttp(url, timeout, predicate = response => response.status >= 200 && response.status < 500) {
	const started = Date.now();
	let lastError;
	while (Date.now() - started < timeout) {
		try {
			const response = await httpGet(url, 5000);
			if (predicate(response)) return response;
			lastError = new Error(`Unexpected response ${response.status} from ${url}`);
		} catch (error) {
			lastError = error;
		}
		await wait(500);
	}
	throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd ?? repoRoot,
			env: { ...process.env, ...(options.env ?? {}) },
			stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
		});
		let stdout = '';
		let stderr = '';
		if (options.capture) {
			child.stdout.on('data', chunk => {
				stdout += chunk;
			});
			child.stderr.on('data', chunk => {
				stderr += chunk;
			});
		}
		child.on('error', reject);
		child.on('close', code => {
			if (code === 0) {
				resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
				return;
			}
			reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}${stderr ? `\n${stderr}` : ''}`));
		});
	});
}

function startProcess(command, args, options = {}) {
	const child = spawn(command, args, {
		cwd: options.cwd ?? repoRoot,
		env: { ...process.env, ...(options.env ?? {}) },
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const prefix = options.prefix ? `[${options.prefix}] ` : '';
	child.stdout.on('data', chunk => process.stdout.write(prefix + chunk.toString().replace(/\n$/, '').replace(/\n/g, `\n${prefix}`) + '\n'));
	child.stderr.on('data', chunk => process.stderr.write(prefix + chunk.toString().replace(/\n$/, '').replace(/\n/g, `\n${prefix}`) + '\n'));
	return child;
}

async function stopProcess(child) {
	if (!child || child.exitCode != null || child.signalCode != null) return;
	child.kill('SIGTERM');
	const stopped = await Promise.race([
		new Promise(resolve => child.once('close', resolve)),
		wait(5000).then(() => false),
	]);
	if (stopped === false && child.exitCode == null && child.signalCode == null) {
		child.kill('SIGKILL');
	}
}

async function buildDockerImage(image, dockerfile, skipBuild) {
	if (skipBuild) {
		console.log(`reusing Docker image ${image}`);
		return;
	}
	console.log(`building Docker image ${image} from ${dockerfile}`);
	await runCommand('docker', ['build', '-t', image, '-f', dockerfile, '.'], { cwd: repoRoot });
}

async function startFrontendContainer({ image, containerName, frontendPort, vitePort, blacklabUrl, corpus, timeout }) {
	console.log(`starting frontend container ${containerName} on localhost:${frontendPort}`);
	await runCommand(
		'docker',
		[
			'run',
			'--rm',
			'-d',
			'--name',
			containerName,
			'-p',
			`127.0.0.1:${frontendPort}:8080`,
			'-e',
			`BF_BLSURL=${blacklabUrl}`,
			'-e',
			`BF_BLSURLEXTERNAL=${blacklabUrl}`,
			'-e',
			`BF_BLS_URL=${blacklabUrl}`,
			'-e',
			`BF_BLS_URL_EXTERNAL=${blacklabUrl}`,
			'-e',
			'BF_CACHE=false',
			'-e',
			`BF_VITE=http://localhost:${vitePort}`,
			image,
		],
		{ capture: true },
	);
	await waitForHttp(
		`http://localhost:${frontendPort}/blacklab-frontend/${corpus}/search/`,
		timeout,
		response => response.status === 200 && response.body.includes(`http://localhost:${vitePort}/src/app/entrypoint/main.ts`),
	);
}

async function stopFrontendContainer(containerName) {
	await runCommand('docker', ['rm', '-f', containerName], { capture: true }).catch(() => {});
}

async function startVite({ vitePort, frontendPort, blacklabUrl, timeout }) {
	assert(await isPortFree(vitePort), `Vite port ${vitePort} is already in use. Stop the existing server or pass --vite-port.`);
	const child = startProcess(process.execPath, [viteBin, '--host', '0.0.0.0', '--port', String(vitePort)], {
		cwd: frontendRoot,
		prefix: 'vite',
		env: {
			BLF_VITE_PORT: String(vitePort),
			BLF_FRONTEND_PROXY_TARGET: `http://localhost:${frontendPort}`,
			BLF_BLACKLAB_PROXY_TARGET: blackLabProxyOrigin(blacklabUrl),
		},
	});
	const startup = await Promise.race([
		waitForHttp(`http://localhost:${vitePort}/@vite/client`, timeout).then(() => 'ready'),
		new Promise(resolve => child.once('close', code => resolve({ code }))),
	]);
	if (startup !== 'ready') {
		throw new Error(`Vite exited before becoming ready: ${JSON.stringify(startup)}`);
	}
	return child;
}

function summarizeUrl(url) {
	const parsed = new URL(url);
	const scopedKeys = [...parsed.searchParams.keys()].filter(key => key.startsWith('f.'));
	const scopedFieldKeys = scopedKeys.filter(key => !reservedScopedKeys.has(key));
	return {
		url,
		pathname: parsed.pathname,
		patt: parsed.searchParams.get('patt'),
		submittedForm: parsed.searchParams.get('f.form'),
		scopedKeys,
		scopedFieldKeys,
		legacyFormUiKeys: findLegacyFormUiKeys(parsed),
	};
}

function findLegacyFormUiKeys(url) {
	const parsed = url instanceof URL ? url : new URL(url);
	const found = [...legacyFormUiKeys].filter(key => parsed.searchParams.has(key));
	const encodedInterface = parsed.searchParams.get('interface');
	if (!encodedInterface) return found;

	try {
		const interfaceState = JSON.parse(encodedInterface);
		if (interfaceState && typeof interfaceState === 'object' && !Array.isArray(interfaceState)) {
			for (const key of legacyFormUiKeys) {
				if (Object.prototype.hasOwnProperty.call(interfaceState, key)) found.push(`interface.${key}`);
			}
		}
	} catch {
		found.push('interface (malformed)');
	}
	return found;
}

async function snapshot(page) {
	return page.evaluate(() => {
		const modules = window.vuexModules;
		const history = modules?.history?.getState?.() ?? [];
		const formSystem = document.querySelector('.blf-form-system');
		const isVisible = element => !!element && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
		const activeForm = formSystem ? [...formSystem.querySelectorAll('form')].find(isVisible) : null;
		return {
			url: window.location.href,
			params: modules?.root?.get?.blacklabParameters?.() ?? null,
			interface: modules?.interface?.getState?.() ?? null,
			query: modules?.query?.getState?.() ?? null,
			scopedFormQuery: modules?.query?.get?.scopedFormQuery?.() ?? null,
			useNewSearchForm: modules?.global?.getState?.().useNewSearchForm ?? null,
			title: document.title,
			bodyText: document.body?.innerText?.slice(0, 2000) ?? '',
			hasVueRoot: !!document.querySelector('#vue-root'),
			hasNewForm: !!formSystem,
			hasActiveNewForm: !!activeForm,
			selectedTabs: formSystem
				? [...formSystem.querySelectorAll('[role="tab"][aria-selected="true"]')].map(tab => ({
						name: tab.textContent?.trim() ?? '',
						controls: tab.getAttribute('aria-controls'),
					}))
				: [],
			activeElement: document.activeElement
				? {
						tagName: document.activeElement.tagName,
						id: document.activeElement.id,
						name: document.activeElement.getAttribute('name'),
						className: document.activeElement.getAttribute('class'),
						value: 'value' in document.activeElement ? document.activeElement.value : undefined,
					}
				: null,
			inputs: activeForm
				? [...activeForm.querySelectorAll('input')].slice(0, 20).map(input => ({
						id: input.id,
						name: input.name,
						type: input.type,
						className: input.className,
						value: input.value,
						placeholder: input.placeholder,
						disabled: input.disabled,
						visible: isVisible(input),
					}))
				: [],
			history: history.slice(0, 5).map(entry => ({
				url: entry.url,
				viewedResults: entry.interface?.viewedResults,
				pattern: entry.displayValues?.pattern,
			})),
		};
	});
}

async function dumpFailure(page) {
	const failureDir = path.join(frontendRoot, 'tmp');
	await mkdir(failureDir, { recursive: true });
	const file = path.join(failureDir, `url-sync-smoke-failure-${Date.now()}.json`);
	await writeFile(file, JSON.stringify(await snapshot(page), null, 2));
	return file;
}

async function waitForApp(page, timeout) {
	await page.locator('#vue-root').waitFor({ state: 'visible', timeout });
}

async function enableNewSearchForm(page, timeout) {
	const previousValue = await page.evaluate(() => {
		const modules = window.vuexModules;
		const previous = modules?.global?.getState?.().useNewSearchForm;
		modules?.global?.actions?.useNewSearchForm?.(true);
		return previous;
	});
	await page.waitForFunction(() => window.vuexModules?.global?.getState?.().useNewSearchForm === true, null, { timeout });
	await page.waitForSelector('.blf-form-system', { state: 'visible', timeout });
	return previousValue;
}

async function restoreNewSearchFormPreference(page, previousValue) {
	if (typeof previousValue !== 'boolean' || page.isClosed()) return;
	await page.evaluate(previous => {
		window.vuexModules?.global?.actions?.useNewSearchForm?.(previous);
	}, previousValue);
}

function newFormRoot(page) {
	return page.locator('.blf-form-system').first();
}

function formNodeIdPart(value) {
	return Array.from(value, character => {
		if (/^[A-Za-z0-9-]$/.test(character)) return character;
		if (character === '_') return '__';
		return `_${character.codePointAt(0).toString(16)}`;
	}).join('');
}

function formNodeTab(root, nodeId) {
	return root.locator(`[role="tab"][aria-controls$="--a-${formNodeIdPart(nodeId)}"]`).first();
}

async function activeNewForm(page, timeout) {
	const root = newFormRoot(page);
	await root.waitFor({ state: 'visible', timeout });
	const form = root.locator('form:visible').first();
	await form.waitFor({ state: 'visible', timeout });
	return form;
}

async function findQueryInput(page, selectorOverride, timeout) {
	if (selectorOverride) {
		const override = page.locator(selectorOverride).first();
		if ((await override.count()) > 0) {
			try {
				await override.waitFor({ state: 'visible', timeout: Math.min(timeout, 1500) });
				if (await override.isEditable()) return override;
			} catch {
				// Fall through to the active form's semantic textbox lookup.
			}
		}
	}

	const form = await activeNewForm(page, timeout);
	const textboxes = form.getByRole('textbox');
	for (let index = 0; index < (await textboxes.count()); index += 1) {
		const textbox = textboxes.nth(index);
		if ((await textbox.isVisible()) && (await textbox.isEditable())) return textbox;
	}

	throw new Error('Could not find an editable textbox in the active new-form form. Set BLF_SMOKE_QUERY_SELECTOR if this corpus uses different markup.');
}

async function waitForVisibleSearchMode(page, mode, timeout) {
	const formId = searchModeFormIds[mode];
	assert(formId, `No form node is configured for search mode '${mode}'.`);
	const tab = formNodeTab(newFormRoot(page), formId);
	await tab.waitFor({ state: 'visible', timeout });
	const tabElement = await tab.elementHandle();
	assert(tabElement, `Could not resolve the ${mode} search-mode tab.`);
	await page.waitForFunction(element => element?.getAttribute('aria-selected') === 'true', tabElement, { timeout });
	await activeNewForm(page, timeout);
}

async function assertVisibleSearchMode(page, mode, timeout, label) {
	try {
		await waitForVisibleSearchMode(page, mode, timeout);
	} catch (error) {
		throw new Error(`Expected the ${mode} search form to be visible ${label}. Submitted state was restored, but the rendered form was not.`, { cause: error });
	}
}

async function waitForSearchState(page, expectedTerm, timeout, expectedPatternMode = 'simple') {
	const expectedFormId = `search.${expectedPatternMode}`;
	await page.waitForFunction(
		({ term, formId, legacyKeys }) => {
			const url = new URL(window.location.href);
			let interfaceState = {};
			try {
				interfaceState = JSON.parse(url.searchParams.get('interface') || '{}');
			} catch {
				// The URL parser will report malformed interface state separately.
				return false;
			}
			const scopedKeys = [...url.searchParams.keys()].filter(key => key.startsWith('f.'));
			const scopedFieldKeys = scopedKeys.filter(key => key !== 'f.form' && key !== 'f.tab');
			const hasLegacyUiState =
				legacyKeys.some(key => url.searchParams.has(key)) ||
				(interfaceState && typeof interfaceState === 'object' && !Array.isArray(interfaceState) && legacyKeys.some(key => Object.prototype.hasOwnProperty.call(interfaceState, key)));
			const root = document.querySelector('.blf-form-system');
			const visible = element => !!element && !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
			const activeForm = root ? [...root.querySelectorAll('form')].find(visible) : null;
			const input = activeForm ? [...activeForm.querySelectorAll('input[type="text"], input:not([type]), textarea')].find(element => visible(element) && !element.disabled && !element.readOnly) : null;
			const queryState = window.vuexModules?.query?.getState?.();

			return !!(
				url.pathname.endsWith('/search/hits') &&
				url.searchParams.get('patt')?.includes(term) &&
				url.searchParams.get('f.form') === formId &&
				scopedFieldKeys.length > 0 &&
				!hasLegacyUiState &&
				queryState?.form === 'new' &&
				queryState?.state?.formId === formId &&
				input &&
				input.value === term
			);
		},
		{ term: expectedTerm, formId: expectedFormId, legacyKeys: [...legacyFormUiKeys] },
		{ timeout },
	);
}

async function selectSearchMode(page, mode, timeout) {
	const root = newFormRoot(page);
	const searchTab = formNodeTab(root, 'patterns');
	await searchTab.waitFor({ state: 'visible', timeout });
	if ((await searchTab.getAttribute('aria-selected')) !== 'true') await searchTab.click();

	const formId = searchModeFormIds[mode];
	assert(formId, `No form node is configured for search mode '${mode}'.`);
	const modeTab = formNodeTab(root, formId);
	await modeTab.waitFor({ state: 'visible', timeout });
	if ((await modeTab.getAttribute('aria-selected')) !== 'true') await modeTab.click();
	await waitForVisibleSearchMode(page, mode, timeout);
}

async function submitSearch(page, selectorOverride, query, timeout, mode = 'simple') {
	const input = await findQueryInput(page, selectorOverride, timeout);
	await input.click();
	await input.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
	await input.press('Backspace');
	await input.type(query);
	assert((await input.inputValue()) === query, `Expected selected input to contain '${query}' before submit.`, await snapshot(page));
	await input.press('Enter');
	await waitForSearchState(page, query, timeout, mode);
	const state = await snapshot(page);
	const legacyKeys = findLegacyFormUiKeys(state.url);
	assert(legacyKeys.length === 0, 'Expected the new-form URL to omit legacy form/tab UI state.', { legacyKeys, url: state.url });
	console.log(`ok ${mode} search '${query}'`, summarizeUrl(state.url));
}

async function assertQueryInputValue(page, selectorOverride, expectedTerm, timeout, label) {
	const input = await findQueryInput(page, selectorOverride, timeout);
	const value = await input.inputValue();
	assert(value === expectedTerm, `Expected the active new-form query input to contain '${expectedTerm}' ${label}, got '${value}'.`, await snapshot(page));
	console.log(`ok form input held '${expectedTerm}' ${label}`);
}

async function waitForResetState(page, selectorOverride, timeout) {
	await page.waitForFunction(
		() => {
			const url = new URL(window.location.href);
			return !url.searchParams.has('patt') && ![...url.searchParams.keys()].some(key => key.startsWith('f.'));
		},
		null,
		{ timeout },
	);
	const input = await findQueryInput(page, selectorOverride, timeout);
	assert((await input.inputValue()) === '', 'Expected the simple-search input to be empty after reset.', await snapshot(page));
}

async function restoreHistoryEntry(page, selectorOverride, expectedTerm, timeout) {
	const result = await page.evaluate(async term => {
		const modules = window.vuexModules;
		const entry = modules?.history?.getState?.().find(item => item.url && new URL(item.url, window.location.origin).searchParams.get('patt')?.includes(term));
		if (!entry) {
			return {
				ok: false,
				reason: 'No matching history entry found.',
				history: modules?.history?.getState?.().map(item => item.url) ?? [],
			};
		}

		const parsed = new URL(entry.url, window.location.origin);
		const relativeUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
		const context = (window.CONTEXT_URL || '').replace(/\/+$/, '');
		const routerPath = context && relativeUrl.startsWith(context) ? relativeUrl.slice(context.length) || '/' : relativeUrl;
		const router = window.vueRoot?.$router || window.vueApp?.config?.globalProperties?.$router;
		if (router?.push) {
			await router.push(routerPath);
			return { ok: true, url: entry.url, routerPath };
		}

		window.location.href = relativeUrl;
		return { ok: true, url: entry.url, routerPath, reloaded: true };
	}, expectedTerm);

	assert(result.ok, 'Could not restore a matching history entry.', result);
	if (result.reloaded) {
		await waitForApp(page, timeout);
	}
	await waitForSearchState(page, expectedTerm, timeout);
	await assertQueryInputValue(page, selectorOverride, expectedTerm, timeout, 'after history restore');
	console.log(`ok restored history entry for '${expectedTerm}'`, result);
}

async function run() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		help();
		return;
	}

	const corpus = option(args, 'corpus', 'BLF_SMOKE_CORPUS', defaultCorpus);
	const blacklabUrl = normalizeBlackLabUrl(option(args, 'blacklabUrl', 'BLF_SMOKE_BLS_URL', defaultBlackLabUrl));
	const vitePort = numberOption(args, 'vitePort', 'BLF_SMOKE_VITE_PORT', 5173);
	const explicitFrontendPort = option(args, 'frontendPort', 'BLF_SMOKE_FRONTEND_PORT', null);
	const frontendPort = explicitFrontendPort ? numberOption(args, 'frontendPort', 'BLF_SMOKE_FRONTEND_PORT', explicitFrontendPort) : await findFreePort(18080);
	const dockerImage = option(args, 'dockerImage', 'BLF_SMOKE_DOCKER_IMAGE', defaultDockerImage);
	const dockerfile = option(args, 'dockerfile', 'BLF_SMOKE_DOCKERFILE', defaultDockerfile);
	const skipDockerBuild = booleanOption(args, 'skipDockerBuild', 'BLF_SMOKE_SKIP_DOCKER_BUILD', false);
	const externalStack = booleanOption(args, 'externalStack', 'BLF_SMOKE_EXTERNAL_STACK', false);
	const initialUrl = option(args, 'url', 'BLF_SMOKE_URL', `http://localhost:${vitePort}/blacklab-frontend/${corpus}/search/`);
	const queryOne = option(args, 'queryOne', 'BLF_SMOKE_QUERY_ONE', 'schip');
	const queryTwo = option(args, 'queryTwo', 'BLF_SMOKE_QUERY_TWO', 'schaap');
	const selectorOverride = option(args, 'querySelector', 'BLF_SMOKE_QUERY_SELECTOR', null);
	const timeout = numberOption(args, 'timeout', 'BLF_SMOKE_TIMEOUT', 20_000);
	const headless = booleanOption(args, 'headless', 'BLF_SMOKE_HEADLESS', true);
	const slowMo = numberOption(args, 'slowMo', 'BLF_SMOKE_SLOWMO', 0);
	const keepOpen = booleanOption(args, 'keepOpen', 'BLF_SMOKE_KEEP_OPEN', false);
	const traceUrlSync = booleanOption(args, 'traceUrlSync', 'BLF_SMOKE_TRACE_URL_SYNC', false);
	const containerName = `blf-url-sync-smoke-${process.pid}`;

	let viteProcess = null;
	let containerStarted = false;
	let browser = null;
	let page = null;
	let previousUseNewSearchForm;

	try {
		if (!externalStack) {
			await buildDockerImage(dockerImage, dockerfile, skipDockerBuild);
			await startFrontendContainer({
				image: dockerImage,
				containerName,
				frontendPort,
				vitePort,
				blacklabUrl,
				corpus,
				timeout,
			});
			containerStarted = true;
			viteProcess = await startVite({ vitePort, frontendPort, blacklabUrl, timeout });
		}

		browser = await chromium.launch({ headless, slowMo });
		const context = await browser.newContext();
		page = await context.newPage();
		page.setDefaultTimeout(timeout);
		if (traceUrlSync) {
			await page.addInitScript(() => {
				window.__BLF_URL_SYNC_TRACE__ = true;
			});
			page.on('console', async message => {
				if (!message.text().includes('[url-sync-trace]')) return;
				const args = await Promise.all(
					message.args().map(async arg => {
						try {
							return await arg.jsonValue();
						} catch {
							return arg.toString();
						}
					}),
				);
				console.log(...args.map(value => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))));
			});
		}
		page.on('pageerror', error => {
			console.error('pageerror:', error);
		});

		console.log(`opening ${initialUrl}`);
		await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout });
		await waitForApp(page, timeout);
		previousUseNewSearchForm = await enableNewSearchForm(page, timeout);

		await selectSearchMode(page, 'simple', timeout);
		await submitSearch(page, selectorOverride, queryOne, timeout, 'simple');
		await selectSearchMode(page, 'extended', timeout);
		await submitSearch(page, selectorOverride, queryTwo, timeout, 'extended');

		await page.goBack({ waitUntil: 'domcontentloaded', timeout });
		await waitForSearchState(page, queryOne, timeout, 'simple');
		await assertVisibleSearchMode(page, 'simple', timeout, 'after browser back');
		console.log(`ok browser back restored '${queryOne}' in the simple form`);

		await page.goForward({ waitUntil: 'domcontentloaded', timeout });
		await waitForSearchState(page, queryTwo, timeout, 'extended');
		await assertVisibleSearchMode(page, 'extended', timeout, 'after browser forward');
		console.log(`ok browser forward restored '${queryTwo}' in the extended form`);

		await restoreHistoryEntry(page, selectorOverride, queryOne, timeout);

		await page.reload({ waitUntil: 'domcontentloaded', timeout });
		await waitForApp(page, timeout);
		await waitForSearchState(page, queryOne, timeout);
		await assertQueryInputValue(page, selectorOverride, queryOne, timeout, 'after reload');
		console.log(`ok reload restored '${queryOne}' from the URL`);

		await page.locator('.blf-form-system button[type="reset"]').first().click();
		await waitForResetState(page, selectorOverride, timeout);
		console.log('ok reset cleared submitted query and scoped URL params');

		console.log('url-sync smoke test passed');
	} catch (error) {
		if (page) {
			const file = await dumpFailure(page).catch(() => null);
			console.error(file ? `Failure snapshot written to ${file}` : 'Could not write failure snapshot.');
		}
		throw error;
	} finally {
		if (page) {
			await restoreNewSearchFormPreference(page, previousUseNewSearchForm).catch(() => {});
		}
		if (browser && !keepOpen) {
			await browser.close();
		}
		await stopProcess(viteProcess);
		if (containerStarted) {
			await stopFrontendContainer(containerName);
		}
	}
}

run().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
