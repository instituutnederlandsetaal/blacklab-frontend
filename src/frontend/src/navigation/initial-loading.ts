import { toValue, watchPostEffect, type App, type MaybeRefOrGetter } from 'vue';

export function createInitialLoading(ready: MaybeRefOrGetter<boolean>) {
	return {
		install(app: App) {
			const stop = watchPostEffect(() => {
				if (!toValue(ready)) return;
				document.getElementById('vue-root')?.removeAttribute('inert');
				document.getElementById('startup-status')?.remove();
				document.body.classList.remove('startup-pending');
				stop();
			});
			app.onUnmount(stop);
		},
	};
}
