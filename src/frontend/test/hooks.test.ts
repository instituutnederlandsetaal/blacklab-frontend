import { afterEach, describe, expect, test } from 'vitest';

import { installHooksGlobal } from '@/interop/hooks';

type Hook = () => Promise<unknown>;
type HookTestGlobal = typeof globalThis & {
	hooks?: Record<string, unknown>;
	__cfHooksStore?: Record<string, unknown[]>;
};

function clearHooksGlobal() {
	const hookGlobal = globalThis as HookTestGlobal;
	delete hookGlobal.hooks;
	delete hookGlobal.__cfHooksStore;
}

describe('installHooksGlobal', () => {
	afterEach(() => clearHooksGlobal());

	test('registers hooks through assignment and function-call syntax', () => {
		clearHooksGlobal();
		const calledAfterInstall = () => Promise.resolve('called after install');
		const assignedAfterInstall = () => Promise.resolve('assigned after install');

		const hookGlobal = globalThis as HookTestGlobal;
		const hooks = installHooksGlobal();
		hooks.testHook(calledAfterInstall);
		(hooks as unknown as Record<string, Hook>).otherHook = assignedAfterInstall;

		expect(hookGlobal.__cfHooksStore).toEqual({
			testHook: [calledAfterInstall],
			otherHook: [assignedAfterInstall],
		});
	});
});
