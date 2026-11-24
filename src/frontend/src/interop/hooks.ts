import { customJsDisposeEvent } from '@/interop/page-customization';

type Hook = (() => unknown) | Promise<unknown>;
type HookStore = Record<string, Set<() => unknown>>;
type HookRegistration = ((fn: Hook) => void) & Hook[];
type HookRegistry = Record<string | symbol, HookRegistration>;
type HooksGlobal = typeof globalThis & {
	hooks?: HookRegistry;
	__cfHooksStore?: HookStore;
};

const canary = Symbol('canaryHook');

export function installHooksGlobal(): HookRegistry {
	const hookGlobal = globalThis as HooksGlobal;
	if (hookGlobal.hooks?.[canary]) return hookGlobal.hooks;

	const store = hookGlobal.__cfHooksStore ?? (hookGlobal.__cfHooksStore = {});
	function register(name: string, hook: Hook) {
		const registrations = (store[name] ??= new Set());
		const script = typeof document === 'undefined' ? null : document.currentScript;
		const run = () => (typeof hook === 'function' ? hook() : hook);
		registrations.add(run);
		script?.addEventListener(customJsDisposeEvent, () => registrations.delete(run), { once: true });
	}
	const registeredHooks = hookGlobal.hooks as unknown as Record<string, Hook> | undefined;
	for (const [name, hook] of Object.entries(registeredHooks ?? {})) register(name, hook);

	const hooks = new Proxy(
		{},
		{
			get(target, prop: string | symbol) {
				if (typeof prop !== 'string') return Reflect.get(target, prop);
				return (fn: Hook) => register(prop, fn);
			},
			set(target, prop: string | symbol, value: Hook) {
				if (typeof prop !== 'string') return Reflect.set(target, prop, value);
				register(prop, value);
				return true;
			},
		},
	) as HookRegistry;
	Object.defineProperty(hooks, canary, { value: true });
	hookGlobal.hooks = hooks;

	return hooks;
}

export async function runHooks(name: string): Promise<unknown[]> {
	const hooks = (globalThis as HooksGlobal).__cfHooksStore?.[name];
	const results = [];
	if (hooks) {
		// A page change may replace script registrations while an earlier hook is awaiting.
		for (const hook of [...hooks]) {
			if (hooks.has(hook)) results.push(await hook());
		}
	}
	return results;
}
