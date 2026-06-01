import type { CorpusContext } from '@/entities/corpus/model/corpus-context';
import type { FormBuilder, ContainerNode, FormRuntimeContext } from '@/features/form';

type SearchFormCustomization = (input: { builder: FormBuilder; context: FormRuntimeContext; corpus: CorpusContext; root: ContainerNode }) => void;

const listeners: SearchFormCustomization[] = [];

/**
 * @param listener the listener
 * @returns a function that will remove the listener when called.
 */
export function registerSearchFormCustomization(listener: SearchFormCustomization) {
	listeners.push(listener);

	return () => {
		const index = listeners.indexOf(listener);
		if (index >= 0) listeners.splice(index, 1);
	};
}

export function runSearchFormCustomizations(input: Parameters<SearchFormCustomization>[0]) {
	for (const listener of [...listeners]) {
		listener(input);
	}
}
