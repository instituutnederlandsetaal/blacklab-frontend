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

const defaultCorpus = 'alpino';
const defaultBlackLabUrl = 'http://localhost:8082/blacklab-server/';
const defaultDockerImage = 'blacklab-frontend-url-sync-smoke:local';
const defaultDockerfile = 'docker/frontend-proxy.dockerfile';
const reservedScopedKeys = new Set(['f.form', 'f.tab']);
const legacyFormUiKeys = new Set(['form', 'patternMode', 'exploreMode', 'activeAnnotationTab', 'activeFilterTab']);
const standardFormNamespace = 'standard-search-form';
const collocationsFormId = `${standardFormNamespace}/collocations-form`;
const searchModeFormIds = {
	simple: `${standardFormNamespace}/search-form/simple`,
	extended: `${standardFormNamespace}/search-form/extended`,
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
  npm run test:url-sync:smoke -- --corpus alpino --frontend-port 18080

Default flow:
  1. Build a local BlackLab Frontend smoke Docker image.
  2. Start that frontend container on an isolated host port.
  3. Configure it with BF_BLSURL/BF_BLSURLEXTERNAL=${defaultBlackLabUrl}
  4. Start Vite on :5173 with /blacklab-frontend proxied to that container.
  5. Drive ${defaultCorpus} search through Playwright and assert the URL and visible search state.

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
  BLF_SMOKE_COLLOCATION_QUERY              Collocation keyword. Defaults to schip.
  BLF_SMOKE_HEADLESS=false                 Run with a visible browser.
  BLF_SMOKE_SLOWMO=100                     Slow Playwright actions down, in ms.
  BLF_SMOKE_KEEP_OPEN=true                 Leave the browser open after the run.
  BLF_SMOKE_ARTICLE=true / --article        Also test document hit navigation. Requires a working
                                          article stylesheet and at least two matches in the first document.
                                          BlackLab's generated alpino XSL currently fails to compile.
  BLF_SMOKE_TIMEOUT=30000                  Per-step timeout in ms.
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
	const stopped = await Promise.race([new Promise(resolve => child.once('close', resolve)), wait(5000).then(() => false)]);
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
	const internalBlacklabUrl = new URL(blacklabUrl);
	if (['localhost', '127.0.0.1'].includes(internalBlacklabUrl.hostname)) internalBlacklabUrl.hostname = 'host.docker.internal';
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
			`BF_BLSURL=${internalBlacklabUrl}`,
			'-e',
			`BF_BLSURLEXTERNAL=${blacklabUrl}`,
			'-e',
			`BF_BLS_URL=${internalBlacklabUrl}`,
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
	const startup = await Promise.race([waitForHttp(`http://localhost:${vitePort}/@vite/client`, timeout).then(() => 'ready'), new Promise(resolve => child.once('close', code => resolve({ code })))]);
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
	await page.waitForFunction(
		term => {
			const url = new URL(window.location.href);
			return url.pathname.endsWith('/search/hits') && url.searchParams.get('patt')?.includes(term);
		},
		expectedTerm,
		{ timeout },
	);
	await waitForVisibleSearchMode(page, expectedPatternMode, timeout);
	const input = await findQueryInput(page, null, timeout);
	await page.waitForFunction(({ input, term }) => input.value === term, { input: await input.elementHandle(), term: expectedTerm }, { timeout });
	await page.locator('.results-container:visible .results-table').first().waitFor({ state: 'visible', timeout });
}

async function assertUrlUnchanged(page, expected, label) {
	// Allow rendering, resource responses and queued component updates to finish.
	await page.waitForTimeout(300);
	assert(page.url() === expected, `URL changed ${label}.`, { expected, actual: page.url() });
}

async function selectSearchMode(page, mode, timeout) {
	const root = newFormRoot(page);
	const searchTab = formNodeTab(root, `${standardFormNamespace}/section/search`);
	await searchTab.waitFor({ state: 'visible', timeout });
	if ((await searchTab.getAttribute('aria-selected')) !== 'true') await searchTab.click();

	const formId = searchModeFormIds[mode];
	assert(formId, `No form node is configured for search mode '${mode}'.`);
	const modeTab = formNodeTab(root, formId);
	await modeTab.waitFor({ state: 'visible', timeout });
	if ((await modeTab.getAttribute('aria-selected')) !== 'true') await modeTab.click();
	await waitForVisibleSearchMode(page, mode, timeout);
}

async function collocationsAvailable(page) {
	return (await formNodeTab(newFormRoot(page), `${standardFormNamespace}/section/collocations`).count()) > 0;
}

async function waitForCollocationState(page, expectedPattern, timeout) {
	await page.waitForFunction(
		pattern => {
			const url = new URL(window.location.href);
			return url.searchParams.get('patt') === pattern && url.searchParams.get('colltype') === 'proximity' && url.searchParams.get('filter') === '*:*';
		},
		expectedPattern,
		{ timeout },
	);
	await page.locator('.results-container:visible .groups-table .results-table').waitFor({ state: 'visible', timeout });
}

async function runCollocationSmoke(page, keyword, timeout) {
	if (!(await collocationsAvailable(page))) {
		const blacklabVersion = await page.evaluate(() => window.vuexModules?.corpus?.getState?.().corpus?.runtimeVersion ?? null);
		console.log(`skip collocation browser flow: ${blacklabVersion ? `BlackLab ${blacklabVersion}` : 'the configured corpus'} does not expose collocations`);
		return;
	}

	const pattern = `[word="${keyword.replaceAll('"', '\\"')}"]`;
	const collocationUrl = new URL(page.url());
	collocationUrl.pathname = collocationUrl.pathname.replace(/\/search(?:\/.*)?$/, '/search/hits');
	collocationUrl.search = '';
	collocationUrl.searchParams.set('filter', '*:*');
	collocationUrl.searchParams.set('f.form', collocationsFormId);

	await page.goto(collocationUrl.href, { waitUntil: 'domcontentloaded', timeout });
	await waitForApp(page, timeout);
	const collocationsTab = formNodeTab(newFormRoot(page), `${standardFormNamespace}/section/collocations`);
	await collocationsTab.waitFor({ state: 'visible', timeout });
	assert((await collocationsTab.getAttribute('aria-selected')) === 'true', 'Expected the Collocations form to be selected.', await snapshot(page));

	const form = await activeNewForm(page, timeout);
	await form.locator('.blf-collocation-pattern-editor').first().getByRole('button', { name: 'Expert' }).click();
	const expertPattern = form.locator('.blf-collocation-pattern-editor').first().getByRole('textbox').first();
	await expertPattern.waitFor({ state: 'visible', timeout });
	await expertPattern.fill(pattern);
	await form.locator('button[type="submit"]').click();
	await waitForCollocationState(page, pattern, timeout);
	console.log('ok collocation form submitted the expert pattern and filter');

	const groupToggle = page.locator('.results-container button.group-details-toggle').first();
	await groupToggle.waitFor({ state: 'visible', timeout });
	await groupToggle.focus();
	await groupToggle.press('Enter');
	await page.waitForFunction(element => element?.getAttribute('aria-expanded') === 'true', await groupToggle.elementHandle(), { timeout });

	const details = page.locator('.results-container tr.grouprow-details:visible').first();
	await details.waitFor({ state: 'visible', timeout });
	const close = details.locator('button.close-concordances');
	await close.waitFor({ state: 'visible', timeout });
	await close.focus();
	await close.press('Enter');
	await page.waitForFunction(element => element?.getAttribute('aria-expanded') === 'false', await groupToggle.elementHandle(), { timeout });
	assert(await groupToggle.evaluate(element => element === document.activeElement), 'Expected closing a group preview to return focus to its toggle.');
	console.log('ok keyboard group expansion, close, and focus return');

	await groupToggle.press('Enter');
	const openAllContexts = page.locator('.results-container tr.grouprow-details:visible button.open-concordances').first();
	await openAllContexts.waitFor({ state: 'visible', timeout });
	await openAllContexts.click();
	await page.waitForFunction(
		() => {
			const url = new URL(window.location.href);
			return !!url.searchParams.get('viewgroup') && url.searchParams.get('filter') === '*:*';
		},
		null,
		{ timeout },
	);
	await page.locator('.results-container .hits-table table.results-table').waitFor({ state: 'visible', timeout });
	await page.locator('.results-container button:has(.fa-angle-double-left)').first().waitFor({ state: 'visible', timeout });
	const csvButton = page.locator('.results-container button[title*="CSV"]').first();
	assert((await csvButton.count()) === 1 && (await csvButton.isEnabled()), 'Expected the full-context collocation view to expose an enabled CSV export.');
	console.log('ok full-context navigation preserved the filter and exposed export');

	const shareableUrl = page.url();
	await page.reload({ waitUntil: 'domcontentloaded', timeout });
	await waitForApp(page, timeout);
	await page.waitForFunction(
		url => {
			const current = new URL(window.location.href);
			const expected = new URL(url);
			return current.searchParams.get('viewgroup') === expected.searchParams.get('viewgroup') && current.searchParams.get('filter') === '*:*';
		},
		shareableUrl,
		{ timeout },
	);
	await page.locator('.results-container .hits-table table.results-table').waitFor({ state: 'visible', timeout });
	console.log('ok shareable collocation viewgroup URL restored after reload');

	const backToCollocations = page.locator('.results-container button:has(.fa-angle-double-left)').first();
	await backToCollocations.click();
	await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('viewgroup'), null, { timeout });
	await page.locator('.results-container .groups-table table.results-table').waitFor({ state: 'visible', timeout });

	await page.setViewportSize({ width: 420, height: 900 });
	const overflow = await page.locator('.results-container .groups-table').evaluate(element => ({
		clientWidth: element.clientWidth,
		overflowX: getComputedStyle(element).overflowX,
		scrollWidth: element.scrollWidth,
	}));
	assert(
		['auto', 'scroll'].includes(overflow.overflowX) && overflow.scrollWidth > overflow.clientWidth,
		'Expected the collocation results table to scroll horizontally at a narrow viewport.',
		overflow,
	);
	console.log('ok narrow collocation results use local horizontal overflow');

	const docsUrl = new URL(page.url());
	docsUrl.pathname = docsUrl.pathname.replace(/\/search\/hits$/, '/search/docs');
	const docsRequests = [];
	const recordDocsRequest = request => {
		const url = new URL(request.url());
		if (/\/blacklab-server\/.*\/docs\/?$/.test(url.pathname) && url.searchParams.has('patt')) docsRequests.push(request.url());
	};
	page.on('request', recordDocsRequest);
	try {
		await page.goto(docsUrl.href, { waitUntil: 'domcontentloaded', timeout });
		await waitForApp(page, timeout);
		const inactive = page.locator('.results-container:visible .no-results-found');
		await inactive.waitFor({ state: 'visible', timeout });
		assert(/inactive/i.test(await inactive.innerText()), 'Expected the docs view to explain it is inactive for collocations.');
		await assertUrlUnchanged(page, docsUrl.href, 'while showing the inactive collocation docs view');
		assert(docsRequests.length === 0, 'The inactive collocation docs view requested documents.', docsRequests);
	} finally {
		page.off('request', recordDocsRequest);
	}
	console.log('ok collocation /docs link stays selected and inactive without requesting documents');
}

async function submitSearch(page, selectorOverride, query, timeout, mode = 'simple') {
	const input = await findQueryInput(page, selectorOverride, timeout);
	const beforeDraft = page.url();
	await input.click();
	await input.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
	await input.press('Backspace');
	await input.type(query);
	assert((await input.inputValue()) === query, `Expected selected input to contain '${query}' before submit.`, await snapshot(page));
	await assertUrlUnchanged(page, beforeDraft, 'while typing a draft');
	await input.press('Enter');
	await waitForSearchState(page, query, timeout, mode);
	const state = await snapshot(page);
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
	await newFormRoot(page)
		.getByRole('button', { name: /history|geschiedenis/i })
		.click();
	const term = expectedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const row = page
		.locator('#history tbody tr')
		.filter({ hasText: new RegExp(`\\b${term}\\b`) })
		.first();
	await row.waitFor({ state: 'visible', timeout });
	await row
		.getByRole('button', { name: /search|zoek/i })
		.first()
		.click();
	await waitForSearchState(page, expectedTerm, timeout);
	await assertQueryInputValue(page, selectorOverride, expectedTerm, timeout, 'after history restore');
	console.log(`ok restored history entry for '${expectedTerm}' through the history dialog`);
}

async function runArticleNavigationSmoke(page, term, timeout) {
	const searchUrl = page.url();
	await page.locator('.results-container:visible tr.concordance:not(.foreign-hit)').first().click();
	const documentLink = page.locator('.results-container:visible .concordance-details a[href*="/docs/"][href*="findhit="]').first();
	await documentLink.waitFor({ state: 'visible', timeout });
	const articleUrl = await documentLink.getAttribute('href');
	assert(articleUrl, 'The hit does not link to its document.');
	await page.goto(articleUrl, { waitUntil: 'domcontentloaded', timeout });
	const hitControls = page.locator('.article-pagination .pagination-container').filter({ has: page.getByText('Hit', { exact: true }) });
	const waitForHit = async index => {
		await page.waitForFunction(
			index => {
				const highlights = [...document.querySelectorAll('.article #content .hl')];
				return highlights[index]?.classList.contains('active');
			},
			index,
			{ timeout },
		);
		assert((await hitControls.locator('.current').innerText()).trim().startsWith(`${index + 1}/`), 'The hit control does not match the highlighted hit.');
		assert((await page.locator('.article #content .hl.active').innerText()).trim().toLowerCase() === term.toLowerCase(), 'The document highlights a different search term.');
	};
	await waitForHit(0);
	assert((await page.locator('.article #content').innerText()).trim().length > term.length, 'The article contents did not load.');
	const firstHitUrl = page.url();
	await hitControls.locator('a[title="next"]').click();
	await page.waitForURL(url => url.searchParams.get('findhit') !== new URL(firstHitUrl).searchParams.get('findhit'), { timeout });
	await waitForHit(1);
	const secondHitUrl = page.url();
	assert(new URL(secondHitUrl).searchParams.get('patt') === new URL(searchUrl).searchParams.get('patt'), 'Hit navigation changed the search pattern.');
	await page.goBack({ waitUntil: 'domcontentloaded', timeout });
	await page.waitForURL(firstHitUrl, { timeout });
	await waitForHit(0);
	await page.goForward({ waitUntil: 'domcontentloaded', timeout });
	await page.waitForURL(secondHitUrl, { timeout });
	await waitForHit(1);
	await page.goBack({ waitUntil: 'domcontentloaded', timeout });
	await page.waitForURL(firstHitUrl, { timeout });
	await page.goBack({ waitUntil: 'domcontentloaded', timeout });
	await page.waitForURL(searchUrl, { timeout });
	await waitForSearchState(page, term, timeout);
	await assertQueryInputValue(page, null, term, timeout, 'after returning from the document');
	console.log('ok document contents, hit navigation, Back/Forward and return to the submitted search');
}

async function runResultControlsSmoke(page, timeout) {
	const beforeOpen = page.url();
	const results = page.locator('.results-container:visible');
	await newFormRoot(page).locator('button:has(.glyphicon-cog)').click();
	const settings = page.locator('#settings');
	await settings.waitFor({ state: 'visible', timeout });
	await assertUrlUnchanged(page, beforeOpen, 'while opening settings');
	await settings.locator('#context').fill('3');
	await settings.locator('#context').press('Tab');
	await page.waitForFunction(() => new URL(location.href).searchParams.get('context') === '3', null, { timeout });
	await settings.getByRole('button', { name: /close/i }).last().click();
	await results.locator('.results-table').first().waitFor({ state: 'visible', timeout });
	const sort = results.locator('.sort');
	await sort.locator('.menu-button').first().click();
	const option = sort.locator('.menu-option:not(.disabled)[data-value]:not([data-value=""])');
	const selected = await option.evaluateAll(options => options.find(option => option.dataset.value)?.dataset.value);
	assert(selected, 'No sorting option is available.');
	await sort.locator(`[data-value="${selected}"]`).click();
	await page.waitForFunction(value => new URL(location.href).searchParams.get('sort') === value, selected, { timeout });
	await results.locator('.results-table').first().waitFor({ state: 'visible', timeout });
	console.log('ok result context and sorting controls update the URL');
}

async function changePageSize(page, pageSize, timeout) {
	await newFormRoot(page).locator('button:has(.glyphicon-cog)').click();
	const settings = page.locator('#settings');
	await settings.waitFor({ state: 'visible', timeout });
	await settings.locator('#resultsPerPage').fill(String(pageSize));
	await settings.locator('#resultsPerPage').press('Tab');
	await settings.getByRole('button', { name: /close/i }).last().click();
}

async function waitForSelectedRange(page, first, number, timeout) {
	await page.waitForFunction(
		({ first, number }) => {
			const url = new URL(location.href);
			return Number(url.searchParams.get('first')) === first && Number(url.searchParams.get('number')) === number;
		},
		{ first, number },
		{ timeout },
	);
}

async function assertHitRange(page, action, selection, request, timeout) {
	const [response] = await Promise.all([
		page.waitForResponse(
			response => {
				const url = new URL(response.url());
				return /\/hits\/?$/.test(url.pathname) && Number(url.searchParams.get('first')) === request.first && Number(url.searchParams.get('number')) === request.number;
			},
			{ timeout },
		),
		action(),
	]);
	assert(response.ok(), 'The expanded result request failed.', { status: response.status(), url: response.url() });
	await waitForSelectedRange(page, selection.first, selection.number, timeout);
	await page.waitForFunction(
		number => {
			const results = [...document.querySelectorAll('.results-container')].find(element => element.getClientRects().length);
			return results && !results.querySelector('.cf-spinner.overlay') && results.querySelectorAll('tr.concordance:not(.foreign-hit)').length === number;
		},
		request.number,
		{ timeout },
	);
}

async function selectResultView(page, view, timeout) {
	await page
		.locator('#resultTabs a')
		.filter({ hasText: view === 'hits' ? /^(Per Hit|Hits)$/i : /^(Per Document|Documents)$/i })
		.click();
	await page.waitForFunction(view => location.pathname.endsWith(`/search/${view}`), view, { timeout });
	await page.locator('.results-container:visible .results-table').first().waitFor({ state: 'visible', timeout });
	await page.locator('.results-container:visible > .cf-spinner.overlay').waitFor({ state: 'hidden', timeout });
}

async function runPaginationSelectionSmoke(page, term, timeout) {
	await changePageSize(page, 20, timeout);
	const ordinary = new URL(page.url());
	ordinary.searchParams.set('first', '40');
	ordinary.searchParams.set('number', '20');
	ordinary.searchParams.delete('sort');
	await assertHitRange(page, () => page.goto(ordinary.href, { waitUntil: 'domcontentloaded', timeout }), { first: 40, number: 20 }, { first: 40, number: 20 }, timeout);
	await assertHitRange(page, () => changePageSize(page, 50, timeout), { first: 0, number: 50 }, { first: 0, number: 50 }, timeout);
	console.log('ok ordinary page (40,20) becomes (0,50) when the preference changes');

	await changePageSize(page, 20, timeout);
	const custom = new URL(ordinary.href);
	custom.searchParams.set('first', '45');
	custom.searchParams.set('number', '30');
	await assertHitRange(page, () => page.goto(custom.href, { waitUntil: 'domcontentloaded', timeout }), { first: 45, number: 30 }, { first: 40, number: 40 }, timeout);
	await assertUrlUnchanged(page, custom.href, 'after expanding a custom selection for display');
	assert((await page.locator('.results-container:visible .pagination .current').first().innerText()).trim() === '3 - 4', 'Expected the selected range to span pages 3–4.');
	await assertHitRange(page, () => changePageSize(page, 50, timeout), { first: 45, number: 30 }, { first: 0, number: 100 }, timeout);
	await assertUrlUnchanged(page, custom.href, 'after resizing a custom selection');
	await assertHitRange(page, () => page.reload({ waitUntil: 'domcontentloaded', timeout }), { first: 45, number: 30 }, { first: 0, number: 100 }, timeout);
	console.log('ok custom selection (45,30) keeps its URL and displays 40 then 100 hits as the persisted preference changes');

	await selectResultView(page, 'docs', timeout);
	await waitForSelectedRange(page, 0, 50, timeout);
	await page.locator('.results-container:visible .pagination a[title="next"]').first().click();
	await waitForSelectedRange(page, 50, 50, timeout);
	await page.locator('.results-container:visible > .cf-spinner.overlay').waitFor({ state: 'hidden', timeout });
	await selectResultView(page, 'hits', timeout);
	await waitForSelectedRange(page, 45, 30, timeout);
	await selectResultView(page, 'docs', timeout);
	await waitForSelectedRange(page, 50, 50, timeout);
	await selectResultView(page, 'hits', timeout);
	console.log('ok opening a URL initializes only its selected view, and switching views retains both selections');

	await submitSearch(page, null, term, timeout);
	await waitForSelectedRange(page, 0, 50, timeout);
	await selectResultView(page, 'docs', timeout);
	await waitForSelectedRange(page, 0, 50, timeout);
	await selectResultView(page, 'hits', timeout);
	console.log('ok submitting a search resets every view to the first preferred page');
}

async function runLateCustomizationSmoke(page, term, timeout) {
	const original = page.url();
	const incoming = new URL(original);
	incoming.searchParams.set('f.url-sync-late', 'saved');
	await page.goto(incoming.href, { waitUntil: 'domcontentloaded', timeout });
	await waitForSearchState(page, term, timeout);
	await page.evaluate(() => {
		window.frontend.customizeSearchForm({
			customize(form) {
				form.graph
					.getForm(form.ids.searchForm('simple'))
					.addChildren(form.metadataText({ id: 'url-sync-late', defaultDisplayName: 'Late URL field', defaultDescription: '', uiType: 'text' }, { id: 'url-sync-late' }));
			},
		});
	});
	const field = page.getByRole('textbox', { name: 'Late URL field', exact: false });
	await field.waitFor({ state: 'visible', timeout });
	await page.waitForFunction(element => element.value === 'saved', await field.elementHandle(), { timeout });
	await assertUrlUnchanged(page, incoming.href, 'after late customization');
	console.log('ok late customization reconstructed the form from the submitted search');
	await page.goto(original, { waitUntil: 'domcontentloaded', timeout });
	await waitForSearchState(page, term, timeout);
}

async function runLegacyFormSmoke(page, term, timeout) {
	await newFormRoot(page).locator('button:has(.glyphicon-cog)').click();
	await page.locator('#settings #use-new-search-form').uncheck();
	await page.locator('#settings').getByRole('button', { name: /close/i }).last().click();
	await page.locator('#searchTabs a[href="#simple"]').click();
	const legacyForm = page.locator('form').filter({ has: page.locator('#form-search') });
	const input = legacyForm.locator('#simple input[type="text"]').first();
	const beforeDraft = page.url();
	await input.fill(term);
	await assertUrlUnchanged(page, beforeDraft, 'while editing a legacy draft');
	await legacyForm.locator('button[type="submit"]').click();
	await page.waitForFunction(term => new URL(location.href).searchParams.get('patt')?.includes(term), term, { timeout });
	await page.locator('.results-container:visible .results-table').first().waitFor({ state: 'visible', timeout });
	const submitted = page.url();
	await page.locator('#searchTabs a[href="#expert"]').click();
	await assertUrlUnchanged(page, submitted, 'while changing the legacy draft mode');
	await page.reload({ waitUntil: 'domcontentloaded', timeout });
	await input.waitFor({ state: 'visible', timeout });
	await page.waitForFunction(({ input, term }) => input.value === term, { input: await input.elementHandle(), term }, { timeout });
	await assertUrlUnchanged(page, submitted, 'after reloading a legacy search');
	await legacyForm.locator('button[type="reset"]').click();
	await page.waitForFunction(() => !new URL(location.href).searchParams.has('patt'), null, { timeout });
	assert((await input.inputValue()) === '', 'Legacy reset did not clear the query input.');
	console.log('ok legacy submit, draft mode changes, reload and reset');
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
	const queryOne = option(args, 'queryOne', 'BLF_SMOKE_QUERY_ONE', 'de');
	const queryTwo = option(args, 'queryTwo', 'BLF_SMOKE_QUERY_TWO', 'en');
	const collocationQuery = option(args, 'collocationQuery', 'BLF_SMOKE_COLLOCATION_QUERY', 'schip');
	const selectorOverride = option(args, 'querySelector', 'BLF_SMOKE_QUERY_SELECTOR', null);
	const timeout = numberOption(args, 'timeout', 'BLF_SMOKE_TIMEOUT', 30_000);
	const headless = booleanOption(args, 'headless', 'BLF_SMOKE_HEADLESS', true);
	const slowMo = numberOption(args, 'slowMo', 'BLF_SMOKE_SLOWMO', 0);
	const keepOpen = booleanOption(args, 'keepOpen', 'BLF_SMOKE_KEEP_OPEN', false);
	const article = booleanOption(args, 'article', 'BLF_SMOKE_ARTICLE', false);
	const containerName = `blf-url-sync-smoke-${process.pid}`;

	let viteProcess = null;
	let containerStarted = false;
	let browser = null;
	let page = null;

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
		await page.addInitScript(() => {
			if (localStorage.getItem('cf/useNewSearchForm') == null) localStorage.setItem('cf/useNewSearchForm', 'true');
		});
		page.on('pageerror', error => {
			console.error('pageerror:', error);
		});

		console.log(`opening ${initialUrl}`);
		await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout });
		await waitForApp(page, timeout);
		await page.waitForSelector('.blf-form-system', { state: 'visible', timeout });
		await assertUrlUnchanged(page, initialUrl, 'during initial page setup');

		await selectSearchMode(page, 'simple', timeout);
		await submitSearch(page, selectorOverride, queryOne, timeout, 'simple');
		const firstSearchUrl = page.url();
		await selectSearchMode(page, 'extended', timeout);
		await assertUrlUnchanged(page, firstSearchUrl, 'while changing the draft form');
		await submitSearch(page, selectorOverride, queryTwo, timeout, 'extended');

		const secondSearchUrl = page.url();
		await page.goBack({ waitUntil: 'domcontentloaded', timeout });
		await waitForSearchState(page, queryOne, timeout, 'simple');
		await assertVisibleSearchMode(page, 'simple', timeout, 'after browser back');
		await assertUrlUnchanged(page, firstSearchUrl, 'after browser Back');
		console.log(`ok browser back restored '${queryOne}' in the simple form`);

		await page.goForward({ waitUntil: 'domcontentloaded', timeout });
		await waitForSearchState(page, queryTwo, timeout, 'extended');
		await assertVisibleSearchMode(page, 'extended', timeout, 'after browser forward');
		await assertUrlUnchanged(page, secondSearchUrl, 'after browser Forward');
		console.log(`ok browser forward restored '${queryTwo}' in the extended form`);

		await restoreHistoryEntry(page, selectorOverride, queryOne, timeout);
		const restoredUrl = page.url();
		await (await findQueryInput(page, selectorOverride, timeout)).fill('unsubmitted history draft');
		await assertUrlUnchanged(page, restoredUrl, 'while editing a draft after history restore');
		await restoreHistoryEntry(page, selectorOverride, queryOne, timeout);
		await assertUrlUnchanged(page, restoredUrl, 'when loading the saved search already shown in the URL');
		console.log('ok loading the current saved search restores its form despite an unchanged URL');

		const beforeReload = page.url();
		await page.reload({ waitUntil: 'domcontentloaded', timeout });
		await waitForApp(page, timeout);
		await waitForSearchState(page, queryOne, timeout);
		await assertQueryInputValue(page, selectorOverride, queryOne, timeout, 'after reload');
		await assertUrlUnchanged(page, beforeReload, 'after reload');
		console.log(`ok reload restored '${queryOne}' from the URL`);

		if (article) await runArticleNavigationSmoke(page, queryOne, timeout);
		await runLateCustomizationSmoke(page, queryOne, timeout);
		await runResultControlsSmoke(page, timeout);
		await runPaginationSelectionSmoke(page, queryOne, timeout);

		await page.locator('.blf-form-system button[type="reset"]').first().click();
		await waitForResetState(page, selectorOverride, timeout);
		console.log('ok reset cleared submitted query and scoped URL params');

		await runCollocationSmoke(page, collocationQuery, timeout);
		await runLegacyFormSmoke(page, queryOne, timeout);

		console.log('url-sync smoke test passed');
	} catch (error) {
		if (page) {
			const file = await dumpFailure(page).catch(() => null);
			console.error(file ? `Failure snapshot written to ${file}` : 'Could not write failure snapshot.');
		}
		throw error;
	} finally {
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
