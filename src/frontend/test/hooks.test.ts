// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest';

import { installHooksGlobal, runHooks } from '@/interop/hooks';
import { customJsDisposeEvent } from '@/interop/page-customization';

type Hook = () => unknown;
type HookTestGlobal = typeof globalThis & {
	hooks?: Record<string, unknown>;
	__cfHooksStore?: unknown;
};

function clearHooksGlobal() {
	const hookGlobal = globalThis as HookTestGlobal;
	delete hookGlobal.hooks;
	delete hookGlobal.__cfHooksStore;
}

describe('installHooksGlobal', () => {
	afterEach(() => clearHooksGlobal());

	test('preserves hooks registered before installation and supports both registration syntaxes', async () => {
		clearHooksGlobal();
		const registeredBeforeInstall = () => Promise.resolve('registered before install');
		const calledAfterInstall = () => Promise.resolve('called after install');
		const assignedAfterInstall = () => Promise.resolve('assigned after install');
		(globalThis as HookTestGlobal).hooks = { registeredBeforeInstall };

		const hooks = installHooksGlobal();
		hooks.testHook(calledAfterInstall);
		(hooks as unknown as Record<string, Hook>).otherHook = assignedAfterInstall;

		await expect(runHooks('registeredBeforeInstall')).resolves.toEqual(['registered before install']);
		await expect(runHooks('testHook')).resolves.toEqual(['called after install']);
		await expect(runHooks('otherHook')).resolves.toEqual(['assigned after install']);
	});

	test('disposes hooks registered by a removed corpus script and keeps page-wide hooks', async () => {
		const hooks = installHooksGlobal();
		hooks.beforeStateLoaded(() => 'host');
		const script = document.createElement('script');
		const current = vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
		try {
			hooks.beforeStateLoaded(() => 'corpus');
		} finally {
			current.mockRestore();
		}
		await expect(runHooks('beforeStateLoaded')).resolves.toEqual(['host', 'corpus']);
		script.dispatchEvent(new Event(customJsDisposeEvent));
		await expect(runHooks('beforeStateLoaded')).resolves.toEqual(['host']);
	});

	test('runs hooks in registration order', async () => {
		const calls: number[] = [];
		const hooks = installHooksGlobal();
		hooks.ordered(async () => {
			await Promise.resolve();
			calls.push(1);
		});
		hooks.ordered(() => calls.push(2));

		await runHooks('ordered');
		expect(calls).toEqual([1, 2]);
	});
});
