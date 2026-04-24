import { startTemporaryArticleInitialUrlParse } from '@/app/dirty/temporary-article-initial-url-parse';
import { startCorpusBootstrapEffect } from '@/features/corpus/effects/corpus-bootstrap.effect';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { indexId } from '@/navigation/route-context';
import * as i18n from '@/utils/i18n';
import { effectScope, watchEffect, type App } from 'vue';

export function startAppEffects(app: App) {
	app.runWithContext(() => {
		const scope = effectScope();
		scope.run(() => {
			watchEffect(() => void i18n.setIndexId(indexId.value));
			startCorpusBootstrapEffect();
			// TEMPORARY VALIDATION PATCH: article-only initial URL decode for refactor verification.
			startTemporaryArticleInitialUrlParse();
			// startStoreToUrlReflection(),
			startCustomizationInterop();
		})
	
		app.onUnmount(() => scope.stop());
	})
}