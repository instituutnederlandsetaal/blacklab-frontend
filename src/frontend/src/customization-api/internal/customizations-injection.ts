import { toValue, type MaybeRefOrGetter } from 'vue';

import type { Corpus } from '@/types/apptypes';

import type { Customizations } from './internal-api';

import createAppInjection from '@/shared/vue/injection';

type CustomizationsInjection = {
	customizations: Customizations;
	corpus: MaybeRefOrGetter<Corpus | undefined>;
};

const [_key, provideCustomizations, useInjectedCustomizations] = createAppInjection<CustomizationsInjection>('customizations');

export { provideCustomizations };

export function useCustomizations(): Customizations {
	const injected = useInjectedCustomizations();
	if (!toValue(injected.corpus)) throw new Error('useCustomizations() called without a loaded corpus.');
	return injected.customizations;
}
