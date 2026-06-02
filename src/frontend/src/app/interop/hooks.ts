type Hook = (() => Promise<unknown>) | Promise<unknown>;
type HookStore = Record<string, Hook[]>;
type HookRegistration = ((fn: Hook) => void) & Hook[];
type HookRegistry = Record<string, HookRegistration>;
type HooksGlobal = typeof globalThis & {
	hooks?: HookRegistry;
	__cfHooksStore?: HookStore;
};

export function installHooksGlobal(): HookRegistry {
	const hookGlobal = globalThis as HooksGlobal;
	if (hookGlobal.hooks) {
		return hookGlobal.hooks;
	}

	const store = hookGlobal.__cfHooksStore ?? (hookGlobal.__cfHooksStore = {});
	hookGlobal.hooks = new Proxy(
		{},
		{
			get(target, prop: string | symbol) {
				if (typeof prop !== 'string') {
					return Reflect.get(target, prop);
				}

				return (fn: Hook) => {
					if (!store[prop]) store[prop] = [];
					store[prop].push(fn);
				};
			},
			set(target, prop: string | symbol, value: Hook) {
				if (typeof prop !== 'string') {
					return Reflect.set(target, prop, value);
				}

				if (!store[prop]) store[prop] = [];
				store[prop].push(value);
				return true;
			},
		},
	) as HookRegistry;

	return hookGlobal.hooks;
}
