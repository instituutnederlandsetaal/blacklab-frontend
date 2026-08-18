import { afterEach, describe, expect, test } from 'vitest';

import { installHooksGlobal, runHooks } from '@/interop/hooks';

type Hook = () => unknown;
type HookTestGlobal = typeof globalThis & {
	hooks?: Record<string, unknown>;
};

function clearHooksGlobal() {
	const hookGlobal = globalThis as HookTestGlobal;
	delete hookGlobal.hooks;
	delete (hookGlobal as typeof globalThis & { __cfHooksStore?: Record<string, unknown[]> }).__cfHooksStore;
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
