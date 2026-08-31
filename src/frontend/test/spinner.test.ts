// @vitest-environment jsdom

import { mount } from '@vue/test-utils';
import { afterEach, expect, test, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import Spinner from '@/shared/ui/Spinner.vue';

afterEach(() => vi.unstubAllGlobals());

test('owns overlay positioning, observation, and cleanup without imposing a default alignment', () => {
	const observers: ResizeObserverStub[] = [];
	class ResizeObserverStub {
		readonly targets: Element[] = [];
		disconnected = false;

		constructor(readonly callback: ResizeObserverCallback) {
			observers.push(this);
		}

		observe(target: Element) {
			this.targets.push(target);
		}

		unobserve() {}

		disconnect() {
			this.disconnected = true;
		}

		flush() {
			this.callback([], this as unknown as ResizeObserver);
		}
	}
	vi.stubGlobal('ResizeObserver', ResizeObserverStub);
	const mountOverlay = (position: string) =>
		mount(
			defineComponent({
				render: () => h('div', { class: 'host', style: { position } }, [h(Spinner, { overlay: true })]),
			}),
		);

	const bare = mount(Spinner);
	expect(bare.find('.cf-spinner-center').exists()).toBe(false);
	bare.unmount();

	const owned = mountOverlay('static');
	const ownedParent = owned.get('.host').element as HTMLElement;
	const ownedSpinner = owned.get('.cf-spinner').element as HTMLElement;
	expect(ownedParent.style.position).toBe('relative');
	Object.defineProperties(ownedSpinner, { scrollHeight: { value: 10 }, scrollWidth: { value: 20 } });
	ownedParent.getBoundingClientRect = () => ({ bottom: 60, height: 60, left: 0, right: 100, top: 0, width: 100, x: 0, y: 0, toJSON: () => ({}) });
	expect(observers[0].targets).toEqual([ownedParent]);
	observers[0].flush();
	expect(ownedSpinner.style.left).toBe('40px');
	expect(ownedSpinner.style.top).toBe('25px');
	owned.unmount();
	expect(ownedParent.style.position).toBe('static');
	expect(observers[0].disconnected).toBe(true);

	const positioned = mountOverlay('absolute');
	const positionedParent = positioned.get('.host').element as HTMLElement;
	expect(positionedParent.style.position).toBe('absolute');
	positioned.unmount();
	expect(positionedParent.style.position).toBe('absolute');
	expect(observers[1].disconnected).toBe(true);

	const externallyChanged = mountOverlay('static');
	const changedParent = externallyChanged.get('.host').element as HTMLElement;
	changedParent.style.position = 'fixed';
	externallyChanged.unmount();
	expect(changedParent.style.position).toBe('fixed');
});
