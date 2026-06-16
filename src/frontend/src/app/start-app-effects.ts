import { effectScope, watchEffect, type App } from 'vue';

import { startCorpusBootstrapEffect } from '@/features/corpus/effects/corpus-bootstrap.effect';
import { startCustomizationInterop } from '@/features/corpus/effects/page-customization.effect';
import { indexId } from '@/navigation/route-context';
import * as i18n from '@/utils/i18n';

export function startAppEffects(app: App) {
	app.runWithContext(() => {
		const scope = effectScope();
		scope.run(() => {
			watchEffect(() => void i18n.setIndexId(indexId.value));
			startCorpusBootstrapEffect();
			// startStoreToUrlReflection(),
			startCustomizationInterop();
		});

		app.onUnmount(() => scope.stop());
	});
}
