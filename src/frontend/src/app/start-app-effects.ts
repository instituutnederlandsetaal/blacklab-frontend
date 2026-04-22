import { startTemporaryArticleInitialUrlParse } from '@/app/dirty/temporary-article-initial-url-parse';
import { startCorpusBootstrapEffect } from '@/features/corpus/effects/corpus-bootstrap.effect';
import { indexId } from '@/navigation/route-context';
import * as i18n from '@/utils/i18n';
import { watchEffect } from 'vue';

let stopEffects: (() => void)|null = null;

export function startAppEffects(): () => void {
	if (stopEffects) {
		return stopEffects;
	}

	const stops = [
		watchEffect(() => void i18n.setIndexId(indexId.value)),
		startCorpusBootstrapEffect(),
		// TEMPORARY VALIDATION PATCH: article-only initial URL decode for refactor verification.
		startTemporaryArticleInitialUrlParse(),
		// startStoreToUrlReflection(),
	];

	stopEffects = () => {
		stops.splice(0).forEach(stop => stop());
		stopEffects = null;
	};

	return stopEffects;
}