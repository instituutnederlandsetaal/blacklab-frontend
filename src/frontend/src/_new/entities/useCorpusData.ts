import type { BlackLabApi, FrontendApi } from "@/_new/shared/api";
import type { CorpusChange } from "@/_new/entities/corpus-data-from-id";
import { InteractiveLoadable, type Loadable } from "@/utils/loadable-streams";
import { inject, provide, reactive, toValue, watchEffect, type MaybeRef } from "vue";
import type { User } from "oidc-client-ts";
import { pipe } from "rxjs";




const useCache = <T> (name: string) => {
	if (!inject(`cache_${name}`)) {
		const cache = reactive<Record<string|symbol, T>>({});
		provide(`cache_${name}`, cache);
		return cache;
	} else {
		return inject(`cache_${name}`) as Record<string|symbol, T>;
	}
}
const null_cache_key = Symbol('null_cache_key');



function createLoader(corpusId: MaybeRef<string|null>, blacklab: BlackLabApi, frontend: FrontendApi) {
	return new InteractiveLoadable<{corpus: string|null, user: User|null}, CorpusChange>(


}

export const useCorpusData = (corpusId: MaybeRef<string|null>, blacklab: BlackLabApi, frontend: FrontendApi) => {
	const cache = useCache<Loadable<CorpusChange>>('corpusData');


	watchEffect(() => {
		if (!cache[toValue(corpusId) ?? null_cache_key]) cache[toValue(corpusId) ?? null_cache_key] = new InteractiveLoadable<{corpus: string|null, user: User|null}, CorpusChange>(
			pipe
		)
	})

	if (!cache[toValue(corpusId) ?? null_cache_key]) cache[toValue(corpusId) ?? null_cache_key] = 
}