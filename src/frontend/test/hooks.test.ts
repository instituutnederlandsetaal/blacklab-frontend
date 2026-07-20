import { afterEach, describe, expect, test } from 'vitest';

import { installHooksGlobal, runHooks } from '@/interop/hooks';

type Hook = () => Promise<unknown>;
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

	test('registers hooks through assignment and function-call syntax', async () => {
		clearHooksGlobal();
		const calledAfterInstall = () => Promise.resolve('called after install');
		const assignedAfterInstall = () => Promise.resolve('assigned after install');

		const hookGlobal = globalThis as HookTestGlobal;
		const hooks = installHooksGlobal();
		hooks.testHook(calledAfterInstall);
		(hooks as unknown as Record<string, Hook>).otherHook = assignedAfterInstall;

		await expect(runHooks('testHook')).resolves.toEqual(['called after install']);
		await expect(runHooks('otherHook')).resolves.toEqual(['assigned after install']);
	});
});
