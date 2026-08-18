type Hook = (() => unknown) | Promise<unknown>;
type HookStore = Record<string, Hook[]>;
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
	const registeredHooks = hookGlobal.hooks as unknown as Record<string, Hook> | undefined;
	for (const [name, hook] of Object.entries(registeredHooks ?? {})) {
		if (!store[name]) store[name] = [];
		store[name].push(hook);
	}

	const hooks = new Proxy(
		{},
		{
			get(target, prop: string | symbol) {
				if (typeof prop !== 'string') return Reflect.get(target, prop);
				return (fn: Hook) => {
					if (!store[prop]) store[prop] = [];
					store[prop].push(fn);
				};
			},
			set(target, prop: string | symbol, value: Hook) {
				if (typeof prop !== 'string') return Reflect.set(target, prop, value);
				if (!store[prop]) store[prop] = [];
				store[prop].push(value);
				return true;
			},
		},
	) as HookRegistry;
	Object.defineProperty(hooks, canary, { value: true });
	hookGlobal.hooks = hooks;

	return hooks;
}

export async function runHooks(name: string): Promise<unknown[]> {
	const hooks = (globalThis as HooksGlobal).__cfHooksStore?.[name] ?? [];
	const results = [];
	for (const hook of hooks) {
		results.push(await (typeof hook === 'function' ? hook() : hook));
	}
	return results;
}
